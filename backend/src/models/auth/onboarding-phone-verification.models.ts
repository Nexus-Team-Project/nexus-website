/**
 * Mongo collection for onboarding phone verifications. A row means: this
 * login user proved control of this Israeli phone via SMS OTP within the
 * last hour. createWorkspace requires a matching row for Israeli phones
 * and consumes (deletes) it on success. TTL auto-deletes stale rows.
 *
 * Spec: docs/superpowers/specs/2026-07-06-onboarding-phone-otp-monday-popup-design.md
 */
import { Db, ObjectId } from 'mongodb';

export const ONBOARDING_PHONE_VERIFICATION_COLLECTION = 'onboardingPhoneVerifications';

/** One verified (userId, phone) pair. Phone is canonical 05XXXXXXXX. */
export interface OnboardingPhoneVerification {
  _id?: ObjectId;
  /** Prisma login user id (req.user.sub). */
  userId: string;
  /** Canonical 05XXXXXXXX form, produced by normalizeIsraeliPhone. */
  phone: string;
  verifiedAt: Date;
  /** TTL-deletion target - 1 hour after verifiedAt. */
  expiresAt: Date;
}

/**
 * Ensure indexes. Idempotent.
 * - expiresAt_ttl: TTL deletes rows after expiresAt.
 * - user_phone_unique: one row per (userId, phone); verify upserts onto it.
 */
export async function ensureOnboardingPhoneVerificationIndexes(db: Db): Promise<void> {
  const col = db.collection<OnboardingPhoneVerification>(ONBOARDING_PHONE_VERIFICATION_COLLECTION);
  await col.createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
  await col.createIndex({ userId: 1, phone: 1 }, { name: 'user_phone_unique', unique: true });
}
