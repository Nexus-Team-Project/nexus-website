/**
 * Onboarding phone-OTP service. Verifies that the dashboard onboarding user
 * controls the ISRAELI phone they typed, by reusing the wallet's self-managed
 * OTP machinery (InforU SMS, rate limits, bcrypt-hashed codes) and recording
 * a short-lived server-side verification row that createWorkspace requires.
 *
 * Non-Israeli phones never reach this service (they are allowed without OTP).
 *
 * Spec: docs/superpowers/specs/2026-07-06-onboarding-phone-otp-monday-popup-design.md
 */
import { Db } from 'mongodb';
import { normalizeIsraeliPhone } from '../../utils/israeliPhone';
import { startPhoneOtp, confirmPhoneOtpChallenge } from '../auth/phone-otp.service';
import {
  ONBOARDING_PHONE_VERIFICATION_COLLECTION,
  type OnboardingPhoneVerification,
} from '../../models/auth/onboarding-phone-verification.models';

/** How long a verified phone stays valid for workspace creation. */
const VERIFICATION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Host for the SMS WebOTP origin-bound line (`@host #code`). ALWAYS the
 * PRODUCTION dashboard host - a user-facing SMS must never show localhost
 * or a staging URL, regardless of where the backend runs. The format is a
 * bare hostname (no https://) per the SMS one-time-code convention; in dev
 * autofill simply won't match, which is harmless.
 */
export const DASHBOARD_OTP_HOST = 'dashboard.nexus-payment.com';

/**
 * Start an onboarding OTP challenge for an ISRAELI mobile.
 * Input: raw phone (any format) + caller ip for rate limiting.
 * Output: { challengeId } (plus __testCode under NODE_ENV=test).
 * @throws invalid_israeli_phone when the phone is not a valid Israeli mobile;
 *         rate_limited:* / inforu_* errors from the underlying OTP service.
 */
export async function startOnboardingPhoneOtp(
  db: Db,
  args: { phone: string; ip: string },
): Promise<{ challengeId: string; __testCode?: string }> {
  const normalized = normalizeIsraeliPhone(args.phone);
  if (!normalized) throw new Error('invalid_israeli_phone');
  return startPhoneOtp(db, { phone: normalized, ip: args.ip, smsHost: DASHBOARD_OTP_HOST });
}

/**
 * Upsert the (userId, phone) verification record with a fresh TTL.
 * Shared by the real OTP verify and the dev-only skip.
 */
async function recordVerifiedPhone(db: Db, userId: string, phone: string): Promise<void> {
  const now = new Date();
  await db.collection<OnboardingPhoneVerification>(ONBOARDING_PHONE_VERIFICATION_COLLECTION).updateOne(
    { userId, phone },
    {
      $set: { verifiedAt: now, expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS) },
      $setOnInsert: { userId, phone },
    },
    { upsert: true },
  );
}

/**
 * Verify an OTP code and record the (userId, phone) verification.
 * Input: Prisma user id + challengeId + 6-digit code.
 * Output: { verified: true }.
 * @throws otp_invalid / otp_locked from the shared confirm helper.
 */
export async function verifyOnboardingPhoneOtp(
  db: Db,
  args: { userId: string; challengeId: string; code: string },
): Promise<{ verified: true }> {
  const { phone } = await confirmPhoneOtpChallenge(db, {
    challengeId: args.challengeId,
    code: args.code,
  });
  await recordVerifiedPhone(db, args.userId, phone);
  return { verified: true };
}

/**
 * DEV-ONLY: mark an Israeli phone verified WITHOUT sending any SMS. The
 * route exposing this is hard-disabled in production; this writes the same
 * verification record the real OTP flow writes so createWorkspace passes.
 * Input: Prisma user id + raw phone. Output: { verified: true }.
 * @throws invalid_israeli_phone when the phone is not a valid Israeli mobile.
 */
export async function devSkipOnboardingPhoneVerification(
  db: Db,
  args: { userId: string; phone: string },
): Promise<{ verified: true }> {
  const normalized = normalizeIsraeliPhone(args.phone);
  if (!normalized) throw new Error('invalid_israeli_phone');
  await recordVerifiedPhone(db, args.userId, normalized);
  return { verified: true };
}

/**
 * True when the user has an unexpired verification for this phone.
 * Input: Prisma user id + canonical 05XXXXXXXX phone.
 * Output: whether createWorkspace may accept this Israeli phone.
 */
export async function hasVerifiedOnboardingPhone(db: Db, userId: string, phone: string): Promise<boolean> {
  const row = await db
    .collection<OnboardingPhoneVerification>(ONBOARDING_PHONE_VERIFICATION_COLLECTION)
    .findOne({ userId, phone, expiresAt: { $gt: new Date() } });
  return row !== null;
}

/**
 * Delete the verification record after successful workspace creation
 * (single-use). Best-effort - callers may ignore failures.
 */
export async function consumeVerifiedOnboardingPhone(db: Db, userId: string, phone: string): Promise<void> {
  await db
    .collection<OnboardingPhoneVerification>(ONBOARDING_PHONE_VERIFICATION_COLLECTION)
    .deleteMany({ userId, phone });
}
