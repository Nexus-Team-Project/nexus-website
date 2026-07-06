/**
 * Mongo collection for in-flight login email-OTP challenges (new-device
 * second factor for privileged website logins). The 6-digit code is
 * bcrypt-hashed at rest; the challenge token is stored as a sha256 hash.
 * TTL 10 minutes.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { Db, ObjectId } from 'mongodb';

export const LOGIN_OTP_COLLECTION = 'loginOtpChallenges';

/**
 * One login-OTP challenge. codeHash = bcrypt(code, 10); challengeTokenHash =
 * sha256 of the opaque token handed to the browser. Plaintexts never stored.
 */
export interface LoginOtpChallenge {
  _id?: ObjectId;
  /** Prisma User.id of the account mid-login. */
  prismaUserId: string;
  /** Trim+lowercased account email (code delivery target). */
  email: string;
  /** Email language for resends. */
  lang: 'he' | 'en';
  codeHash: string;
  challengeTokenHash: string;
  attempts: number;
  createdAt: Date;
  /** TTL-deletion target: createdAt + 10 minutes. */
  expiresAt: Date;
  verifiedAt: Date | null;
  ip: string | null;
}

/**
 * Ensure indexes on loginOtpChallenges. Idempotent.
 * - expiresAt_ttl: TTL deletes stale challenges.
 * - challengeTokenHash_unique: single-use token lookup.
 * - email_lookup: per-email history scans.
 */
export async function ensureLoginOtpIndexes(db: Db): Promise<void> {
  const col = db.collection<LoginOtpChallenge>(LOGIN_OTP_COLLECTION);
  await col.createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
  await col.createIndex({ challengeTokenHash: 1 }, { name: 'challengeTokenHash_unique', unique: true });
  await col.createIndex({ email: 1, createdAt: -1 }, { name: 'email_lookup' });
}
