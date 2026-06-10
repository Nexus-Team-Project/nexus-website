/**
 * Wallet email-OTP lifecycle service. Generates a 6-digit code, stores
 * its bcrypt hash, sends the plaintext via the wallet email template,
 * and verifies on attempt with attempt-cap and rate-limit protection.
 *
 * Used in two places:
 *   - 'attach_to_phone_signup': paired with a phoneSignupTicket so a
 *     fresh wallet signup proves both phone AND email ownership.
 *   - 'login_recovery': deferred to a later plan.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 4.3 + 6 + 10.6
 */
import { Db, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import {
  EMAIL_OTP_COLLECTION,
  type EmailOtpChallenge,
} from '../../models/auth/email-otp.models';
import { assertRateLimit } from './wallet-rate-limit';
import { sendEmailOtpMessage } from '../email/email-otp-email.service';

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;
const normalize = (e: string): string => e.trim().toLowerCase();

/**
 * Return shape from startEmailOtp. __testCode is only present when
 * NODE_ENV === 'test' so route handlers can never echo it back to
 * a real client.
 */
export interface StartEmailOtpResult {
  challengeId: string;
  __testCode?: string;
}

/**
 * Start an email-OTP challenge. Applies 1/30s + 5/h rate limits per
 * email, generates a 6-digit code via crypto.randomInt, bcrypt-hashes
 * it for storage, and sends the plaintext to the user.
 *
 * @param args.signupTicketId set when paired with a verified-phone ticket;
 *   stored on the challenge so verify can consume both atomically.
 */
export async function startEmailOtp(
  db: Db,
  args: { email: string; ip: string; signupTicketId: string | null; lang?: 'he' | 'en' },
): Promise<StartEmailOtpResult> {
  const email = normalize(args.email);
  await assertRateLimit(db, { bucket: 'email_otp_send', key: email, windowSec: 30, max: 1 });
  await assertRateLimit(db, { bucket: 'email_otp_send_hourly', key: email, windowSec: 3600, max: 5 });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const now = new Date();
  const insert: EmailOtpChallenge = {
    email,
    purpose: args.signupTicketId ? 'attach_to_phone_signup' : 'login_recovery',
    codeHash,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
    verifiedAt: null,
    attempts: 0,
    ip: args.ip || null,
    linkedPhoneSignupTicketId:
      args.signupTicketId && ObjectId.isValid(args.signupTicketId)
        ? new ObjectId(args.signupTicketId)
        : null,
  };
  const r = await db.collection<EmailOtpChallenge>(EMAIL_OTP_COLLECTION).insertOne(insert);
  await sendEmailOtpMessage({ to: email, code, lang: args.lang });

  if (process.env.NODE_ENV === 'test') {
    return { challengeId: r.insertedId.toHexString(), __testCode: code };
  }
  return { challengeId: r.insertedId.toHexString() };
}

/**
 * Verify a code. Bcrypt-compares against the stored hash; wrong codes
 * increment attempts and >= MAX_ATTEMPTS locks the challenge. On
 * success, returns the email and the linked signup-ticket id (if any)
 * so the caller can consume it.
 *
 * @throws otp_invalid (bad code, malformed id, expired, already verified)
 *         or otp_locked
 */
export async function verifyEmailOtp(
  db: Db,
  args: { challengeId: string; code: string },
): Promise<{ email: string; linkedPhoneSignupTicketId: string | null }> {
  if (!ObjectId.isValid(args.challengeId)) throw new Error('otp_invalid');
  const col = db.collection<EmailOtpChallenge>(EMAIL_OTP_COLLECTION);
  const doc = await col.findOne({ _id: new ObjectId(args.challengeId) });
  if (!doc || doc.verifiedAt || doc.expiresAt < new Date()) throw new Error('otp_invalid');
  if (doc.attempts >= MAX_ATTEMPTS) throw new Error('otp_locked');

  const ok = await bcrypt.compare(args.code, doc.codeHash);
  if (!ok) {
    await col.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    throw new Error('otp_invalid');
  }
  await col.updateOne({ _id: doc._id }, { $set: { verifiedAt: new Date() } });
  return {
    email: doc.email,
    linkedPhoneSignupTicketId: doc.linkedPhoneSignupTicketId?.toHexString() ?? null,
  };
}
