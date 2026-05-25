/**
 * Mongo collection for in-flight phone-OTP challenges.
 * Each row represents one InforU SendOtp call. TTL auto-deletes after
 * 10 minutes. Verified rows are kept until TTL expires so a successful
 * code cannot be replayed.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.2
 */
import { Db, ObjectId } from 'mongodb';

export const PHONE_OTP_COLLECTION = 'phoneOtpChallenges';

/** Why a challenge was created. login = phone is on an existing identity. */
export type PhoneOtpPurpose = 'login' | 'signup';

/**
 * A single phone-OTP challenge row. The InforU code itself is never stored;
 * only the RequestToken we got back from SendOtp, which is useless without
 * the code the user receives by SMS.
 */
export interface PhoneOtpChallenge {
  _id?: ObjectId;
  /** Canonical 05XXXXXXXX form, produced by normalizeIsraeliPhone. */
  phone: string;
  purpose: PhoneOtpPurpose;
  /** Pair token from InforU SendOtp; passed back to Authenticate. */
  inforuRequestToken: string;
  createdAt: Date;
  /** TTL-deletion target. 10 minutes after createdAt by convention. */
  expiresAt: Date;
  /** Null until the user enters the correct code, then set once. */
  verifiedAt: Date | null;
  /** Wrong-code counter. 5 wrong attempts locks the challenge. */
  attempts: number;
  ip: string | null;
  userAgentHash: string | null;
}

/**
 * Ensure indexes on phoneOtpChallenges. Idempotent.
 * - expiresAt_ttl: TTL deletes rows after their expiresAt.
 * - phone_lookup: supports per-phone history scans.
 */
export async function ensurePhoneOtpIndexes(db: Db): Promise<void> {
  const col = db.collection<PhoneOtpChallenge>(PHONE_OTP_COLLECTION);
  await col.createIndex(
    { expiresAt: 1 },
    { name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  );
  await col.createIndex(
    { phone: 1, createdAt: -1 },
    { name: 'phone_lookup' },
  );
}
