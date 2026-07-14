/**
 * Login email-OTP lifecycle for privileged website logins on unrecognized
 * devices. Generates a 6-digit code (bcrypt-hashed at rest), an opaque
 * challenge token (sha256-hashed at rest), sends the code by email, and
 * verifies with attempt-cap + rate-limit protection. The browser holds only
 * the challenge token; the session refresh cookie is NEVER issued before a
 * successful verify (enforced by the caller, login-mfa.service).
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { Db } from 'mongodb';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { generateToken, hashToken } from '../../utils/crypto';
import {
  LOGIN_OTP_COLLECTION,
  type ChallengePurpose,
  type LoginOtpChallenge,
} from '../../models/auth/login-otp.models';
import { assertRateLimit } from './wallet-rate-limit';
import { sendLoginOtpMessage } from '../email/login-otp-email.service';
import {
  sendWalletLoginCodeMessage,
  sendWalletResetCodeMessage,
} from '../email/wallet-password-email.service';

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;
const normalize = (e: string): string => e.trim().toLowerCase();

/** __testCode present only when NODE_ENV === 'test'; never echoed to clients. */
export interface StartLoginOtpResult {
  challengeToken: string;
  __testCode?: string;
}

/** Applies the per-email send rate limits (1/30s + 5/h). Throws rate_limited*. */
async function assertSendLimits(db: Db, email: string): Promise<void> {
  await assertRateLimit(db, { bucket: 'login_otp_send', key: email, windowSec: 30, max: 1 });
  await assertRateLimit(db, { bucket: 'login_otp_send_hourly', key: email, windowSec: 3600, max: 5 });
}

/** Generates a fresh 6-digit code and its bcrypt hash. */
async function newCode(): Promise<{ code: string; codeHash: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, codeHash: await bcrypt.hash(code, BCRYPT_ROUNDS) };
}

/**
 * Route the plaintext code to the purpose-appropriate email template:
 * wallet_reset -> reset copy, wallet_login/wallet_signup -> wallet 2FA copy,
 * absent purpose -> the website new-device MFA copy (legacy behavior).
 */
async function sendChallengeCode(args: {
  email: string;
  code: string;
  lang: 'he' | 'en';
  purpose?: ChallengePurpose;
}): Promise<void> {
  if (args.purpose === 'wallet_reset') {
    await sendWalletResetCodeMessage({ to: args.email, code: args.code, lang: args.lang });
    return;
  }
  if (args.purpose === 'wallet_login' || args.purpose === 'wallet_signup') {
    await sendWalletLoginCodeMessage({ to: args.email, code: args.code, lang: args.lang });
    return;
  }
  await sendLoginOtpMessage({ to: args.email, code: args.code, lang: args.lang });
}

/**
 * Start a login-OTP challenge for a password-verified user on an
 * unrecognized device. Rate-limits sends per email, stores hashes only,
 * and emails the plaintext code.
 * Input: user id + email + request ip + email language.
 * Output: the opaque challenge token for the browser to hold.
 */
export async function startLoginOtpChallenge(
  db: Db,
  args: {
    prismaUserId: string | null;
    email: string;
    ip: string | null;
    lang: 'he' | 'en';
    /** Wallet flow discriminator; omit for website new-device MFA. */
    purpose?: ChallengePurpose;
    /** bcrypt hash of a wallet-signup password, stashed until verify. */
    pendingPasswordHash?: string;
  },
): Promise<StartLoginOtpResult> {
  const email = normalize(args.email);
  await assertSendLimits(db, email);

  const { code, codeHash } = await newCode();
  const rawToken = generateToken(48);
  const now = new Date();
  const insert: LoginOtpChallenge = {
    prismaUserId: args.prismaUserId,
    email,
    lang: args.lang,
    codeHash,
    challengeTokenHash: hashToken(rawToken),
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
    verifiedAt: null,
    ip: args.ip || null,
    // Wallet-only fields stay absent on website MFA docs (legacy shape).
    ...(args.purpose
      ? { purpose: args.purpose, pendingPasswordHash: args.pendingPasswordHash ?? null, consumedAt: null }
      : {}),
  };
  await db.collection<LoginOtpChallenge>(LOGIN_OTP_COLLECTION).insertOne(insert);
  await sendChallengeCode({ email, code, lang: args.lang, purpose: args.purpose });

  if (process.env.NODE_ENV === 'test') return { challengeToken: rawToken, __testCode: code };
  return { challengeToken: rawToken };
}

/**
 * Verify a code against a live challenge. Wrong codes increment attempts;
 * >= MAX_ATTEMPTS locks the challenge. Success marks it verified (single-use).
 * Output: the user id + email the challenge belongs to.
 * @throws Error('otp_invalid') | Error('otp_locked')
 */
export async function verifyLoginOtpChallenge(
  db: Db,
  args: { challengeToken: string; code: string },
): Promise<{
  prismaUserId: string | null;
  email: string;
  lang: 'he' | 'en';
  purpose?: ChallengePurpose;
  pendingPasswordHash: string | null;
}> {
  const col = db.collection<LoginOtpChallenge>(LOGIN_OTP_COLLECTION);
  const doc = await col.findOne({ challengeTokenHash: hashToken(args.challengeToken) });
  if (!doc || doc.verifiedAt || doc.expiresAt < new Date()) throw new Error('otp_invalid');
  if (doc.attempts >= MAX_ATTEMPTS) throw new Error('otp_locked');

  const ok = await bcrypt.compare(args.code, doc.codeHash);
  if (!ok) {
    await col.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    throw new Error('otp_invalid');
  }
  await col.updateOne({ _id: doc._id }, { $set: { verifiedAt: new Date() } });
  return {
    prismaUserId: doc.prismaUserId,
    email: doc.email,
    lang: doc.lang,
    purpose: doc.purpose,
    pendingPasswordHash: doc.pendingPasswordHash ?? null,
  };
}

/**
 * Rotate the code on an existing live challenge (user clicked "resend").
 * Keeps the same challenge token; attempts are NOT reset. Rate-limited by
 * the same per-email send buckets as start.
 * @throws Error('otp_invalid') for a dead challenge, rate_limited* on cooldown.
 */
export async function resendLoginOtpCode(
  db: Db,
  args: { challengeToken: string },
): Promise<{ __testCode?: string }> {
  const col = db.collection<LoginOtpChallenge>(LOGIN_OTP_COLLECTION);
  const doc = await col.findOne({ challengeTokenHash: hashToken(args.challengeToken) });
  if (!doc || doc.verifiedAt || doc.expiresAt < new Date()) throw new Error('otp_invalid');

  await assertSendLimits(db, doc.email);
  const { code, codeHash } = await newCode();
  await col.updateOne({ _id: doc._id }, { $set: { codeHash } });
  await sendChallengeCode({ email: doc.email, code, lang: doc.lang, purpose: doc.purpose });

  if (process.env.NODE_ENV === 'test') return { __testCode: code };
  return {};
}
