/**
 * Mongo collection for in-flight email-OTP challenges.
 * The 6-digit code is bcrypt-hashed at rest and never logged. TTL 10 min.
 * Used in the "phone verified but identity unknown" branch and as a
 * future recovery channel for email-only logins.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.3
 */
import { Db, ObjectId } from 'mongodb';

export const EMAIL_OTP_COLLECTION = 'emailOtpChallenges';

/**
 * Why a challenge was created.
 * - attach_to_phone_signup: paired with a phoneSignupTicket; verifying
 *   the email creates/links a NexusIdentity carrying the verified phone.
 * - login_recovery: future use, for email-only recovery flows.
 */
export type EmailOtpPurpose = 'attach_to_phone_signup' | 'login_recovery';

/**
 * A single email-OTP challenge row. codeHash holds bcrypt(code, 10);
 * the plaintext code is sent to the user via email and never persisted.
 */
export interface EmailOtpChallenge {
  _id?: ObjectId;
  /** Trim+lowercased email. */
  email: string;
  purpose: EmailOtpPurpose;
  /** bcrypt(code, 10). Plaintext code is never stored. */
  codeHash: string;
  createdAt: Date;
  /** TTL-deletion target. 10 minutes after createdAt. */
  expiresAt: Date;
  verifiedAt: Date | null;
  attempts: number;
  ip: string | null;
  /**
   * When purpose=attach_to_phone_signup, links this challenge to the
   * phoneSignupTicket that proved the phone. Consumed together on verify.
   */
  linkedPhoneSignupTicketId: ObjectId | null;
}

/**
 * Ensure indexes on emailOtpChallenges. Idempotent.
 * - expiresAt_ttl: TTL deletes rows after their expiresAt.
 * - email_lookup: supports per-email history scans for rate limits.
 */
export async function ensureEmailOtpIndexes(db: Db): Promise<void> {
  const col = db.collection<EmailOtpChallenge>(EMAIL_OTP_COLLECTION);
  await col.createIndex(
    { expiresAt: 1 },
    { name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  );
  await col.createIndex(
    { email: 1, createdAt: -1 },
    { name: 'email_lookup' },
  );
}
