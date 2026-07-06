/**
 * Mongo collection for trusted login devices. A device becomes trusted
 * after a successful login-OTP verification; its opaque cookie token is
 * stored as a sha256 hash. TTL 180 days via expiresAt. revokedAt exists
 * for a future device-management UI.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { Db, ObjectId } from 'mongodb';

export const TRUSTED_DEVICE_COLLECTION = 'trustedDevices';

/** One trusted device row for one Prisma user. */
export interface TrustedDevice {
  _id?: ObjectId;
  /** Prisma User.id that trusts this device. */
  prismaUserId: string;
  /** sha256 of the raw cookie token. Raw token never stored. */
  tokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  /** TTL-deletion target: createdAt + 180 days. */
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Ensure indexes on trustedDevices. Idempotent.
 * - expiresAt_ttl: TTL removes expired devices.
 * - tokenHash_unique: cookie-token lookup.
 * - user_lookup: future device-management listing per user.
 */
export async function ensureTrustedDeviceIndexes(db: Db): Promise<void> {
  const col = db.collection<TrustedDevice>(TRUSTED_DEVICE_COLLECTION);
  await col.createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
  await col.createIndex({ tokenHash: 1 }, { name: 'tokenHash_unique', unique: true });
  await col.createIndex({ prismaUserId: 1 }, { name: 'user_lookup' });
}
