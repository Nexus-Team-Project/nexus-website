/**
 * Wallet phone-OTP lifecycle service. Wraps the InforU SendOtp /
 * Authenticate calls with our own rate limits, attempt cap, and
 * signup-ticket emission for unknown phones.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 6 + 10.6
 * Side: inforu-sms-api.md sections 2 and 3.
 *
 * Flow:
 *   startPhoneOtp ->  rate-limit  ->  InforU SendOtp  ->  challenge row
 *   verifyPhoneOtp -> attempt cap -> InforU Authenticate -> either
 *     - phone known -> return mode=logged_in with the identity hint
 *     - phone unknown -> issue phoneSignupTicket, return mode=phone_verified
 */
import { Db, ObjectId } from 'mongodb';
import { inforuSendOtp, inforuAuthenticateOtp } from '../sms/inforu.client';
import { normalizeIsraeliPhone } from '../../utils/phone';
import { assertRateLimit } from './wallet-rate-limit';
import {
  PHONE_OTP_COLLECTION,
  type PhoneOtpChallenge,
} from '../../models/auth/phone-otp.models';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { createPhoneSignupTicket } from './phone-signup-ticket.service';

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * The two shapes verifyPhoneOtp can return. logged_in carries an
 * identity hint the caller uses to mint a session; phone_verified
 * means the user must now supply email or Google.
 */
export type VerifyPhoneResult =
  | {
      mode: 'logged_in';
      identityId: string;
      email: string;
      prismaUserId: string | null;
    }
  | { mode: 'phone_verified'; signupTicketId: string; phone: string };

/**
 * Start a phone-OTP challenge. Normalizes the phone, applies the
 * 1/30s + 5/h + 50/day-per-IP rate limits, calls InforU SendOtp, and
 * persists a phoneOtpChallenge row keyed by the returned RequestToken.
 *
 * @returns the challengeId to be passed back in verify / resend
 * @throws invalid_phone, rate_limited:<bucket>, or InforU errors
 */
export async function startPhoneOtp(
  db: Db,
  args: { phone: string; ip: string; userAgentHash?: string },
): Promise<{ challengeId: string }> {
  const phone = normalizeIsraeliPhone(args.phone);
  await assertRateLimit(db, { bucket: 'phone_otp_send', key: phone, windowSec: 30, max: 1 });
  await assertRateLimit(db, { bucket: 'phone_otp_send_hourly', key: phone, windowSec: 3600, max: 5 });
  await assertRateLimit(db, { bucket: 'phone_otp_send_ip', key: args.ip || 'no-ip', windowSec: 86400, max: 50 });

  const identities = db.collection(DOMAIN_COLLECTIONS.nexusIdentities);
  const existing = await identities.findOne({ phone });
  const purpose: PhoneOtpChallenge['purpose'] = existing ? 'login' : 'signup';

  const { requestToken } = await inforuSendOtp({ phone, userIp: args.ip });
  const now = new Date();
  const insert: PhoneOtpChallenge = {
    phone,
    purpose,
    inforuRequestToken: requestToken,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
    verifiedAt: null,
    attempts: 0,
    ip: args.ip || null,
    userAgentHash: args.userAgentHash || null,
  };
  const r = await db.collection<PhoneOtpChallenge>(PHONE_OTP_COLLECTION).insertOne(insert);
  return { challengeId: r.insertedId.toHexString() };
}

/**
 * Verify a code against the InforU RequestToken stored on the challenge
 * row. Wrong codes increment `attempts`; >= MAX_ATTEMPTS locks the
 * challenge and forces a new SendOtp. On success, returns mode=logged_in
 * if a NexusIdentity owns the phone, otherwise mode=phone_verified with
 * a single-use signup ticket.
 *
 * @throws otp_invalid (bad code, malformed id, expired, already verified)
 *         or otp_locked
 */
export async function verifyPhoneOtp(
  db: Db,
  args: { challengeId: string; code: string },
): Promise<VerifyPhoneResult> {
  if (!ObjectId.isValid(args.challengeId)) throw new Error('otp_invalid');
  const col = db.collection<PhoneOtpChallenge>(PHONE_OTP_COLLECTION);
  const doc = await col.findOne({ _id: new ObjectId(args.challengeId) });
  if (!doc || doc.verifiedAt || doc.expiresAt < new Date()) throw new Error('otp_invalid');
  if (doc.attempts >= MAX_ATTEMPTS) throw new Error('otp_locked');

  const { ok } = await inforuAuthenticateOtp({
    phone: doc.phone,
    code: args.code,
    requestToken: doc.inforuRequestToken,
  });
  if (!ok) {
    await col.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    throw new Error('otp_invalid');
  }
  await col.updateOne({ _id: doc._id }, { $set: { verifiedAt: new Date() } });

  const identities = db.collection<{
    _id: ObjectId;
    normalizedEmail: string;
    prismaUserId?: string;
  }>(DOMAIN_COLLECTIONS.nexusIdentities);
  const identity = await identities.findOne({ phone: doc.phone });
  if (identity) {
    return {
      mode: 'logged_in',
      identityId: identity._id.toHexString(),
      email: identity.normalizedEmail,
      prismaUserId: identity.prismaUserId ?? null,
    };
  }
  const ticket = await createPhoneSignupTicket(db, doc.phone);
  return { mode: 'phone_verified', signupTicketId: ticket.id, phone: doc.phone };
}

/**
 * Resend an OTP for a prior challenge. Looks up the original phone
 * from the prior row and starts a fresh challenge, subject to the
 * same rate limits as startPhoneOtp. The prior challenge row is
 * left to expire naturally.
 */
export async function resendPhoneOtp(
  db: Db,
  args: { challengeId: string; ip: string },
): Promise<{ challengeId: string }> {
  if (!ObjectId.isValid(args.challengeId)) throw new Error('otp_invalid');
  const prior = await db
    .collection<PhoneOtpChallenge>(PHONE_OTP_COLLECTION)
    .findOne({ _id: new ObjectId(args.challengeId) });
  if (!prior) throw new Error('otp_invalid');
  return startPhoneOtp(db, { phone: prior.phone, ip: args.ip });
}
