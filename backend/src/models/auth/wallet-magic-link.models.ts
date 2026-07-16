/**
 * Mongo collection for in-flight wallet email magic-link tokens. The raw
 * 256-bit token is emailed as a URL and NEVER stored; only its sha256 hash
 * lives here. Single-use (consumedAt) with a 15-minute TTL. This is the sole
 * credential for the wallet email sign-in flow - no 6-digit code exists.
 * Spec: docs/superpowers/specs/2026-07-16-wallet-email-magic-link-auth-design.md
 */
import { Db, ObjectId } from 'mongodb';

export const WALLET_MAGIC_LINK_COLLECTION = 'walletMagicLinks';

/** One magic-link challenge. tokenHash = sha256(rawToken); raw token never stored. */
export interface WalletMagicLink {
  _id?: ObjectId;
  /** sha256 hex of the raw token handed to the email. */
  tokenHash: string;
  /** trim + lowercased delivery target (the account email). */
  email: string;
  /** Email language for the template. */
  lang: 'he' | 'en';
  createdAt: Date;
  /** TTL-deletion target: createdAt + 15 minutes. */
  expiresAt: Date;
  /** Set atomically when the link is consumed (single-use). */
  consumedAt: Date | null;
  ip: string | null;
}

/**
 * Ensure indexes on walletMagicLinks. Idempotent.
 * - expiresAt_ttl: TTL deletes stale/consumed links after expiry.
 * - tokenHash_unique: single-use token lookup + collision guard.
 * - email_lookup: per-email history scans (rate-limit/debug).
 */
export async function ensureWalletMagicLinkIndexes(db: Db): Promise<void> {
  const col = db.collection<WalletMagicLink>(WALLET_MAGIC_LINK_COLLECTION);
  await col.createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
  await col.createIndex({ tokenHash: 1 }, { name: 'tokenHash_unique', unique: true });
  await col.createIndex({ email: 1, createdAt: -1 }, { name: 'email_lookup' });
}
