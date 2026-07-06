/**
 * Trusted-device issue + recognition for the login new-device OTP flow.
 * A device is trusted after a successful OTP verify: the browser gets an
 * opaque 64-byte token in an httpOnly cookie; only its sha256 hash is
 * stored. Recognition requires user match + not expired + not revoked,
 * and touches lastUsedAt.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { Db } from 'mongodb';
import { generateToken, hashToken } from '../../utils/crypto';
import { TRUSTED_DEVICE_COLLECTION, type TrustedDevice } from '../../models/auth/trusted-device.models';

const TRUSTED_DEVICE_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

/**
 * Create a trusted-device row and return the raw cookie token.
 * Input: the user id + request metadata for the future device-management UI.
 * Output: the raw token (cookie value). Only its hash is persisted.
 */
export async function issueTrustedDevice(
  db: Db,
  args: { prismaUserId: string; userAgent: string | null; ipAddress: string | null },
): Promise<string> {
  const rawToken = generateToken(64);
  const now = new Date();
  const insert: TrustedDevice = {
    prismaUserId: args.prismaUserId,
    tokenHash: hashToken(rawToken),
    userAgent: args.userAgent,
    ipAddress: args.ipAddress,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS),
    revokedAt: null,
  };
  await db.collection<TrustedDevice>(TRUSTED_DEVICE_COLLECTION).insertOne(insert);
  return rawToken;
}

/**
 * Check whether a raw cookie token is a live trusted device for this user,
 * touching lastUsedAt on success.
 * Output: true when the device is trusted (login may skip the OTP).
 */
export async function isTrustedDevice(
  db: Db,
  args: { prismaUserId: string; rawToken: string | null },
): Promise<boolean> {
  if (!args.rawToken) return false;
  const doc = await db.collection<TrustedDevice>(TRUSTED_DEVICE_COLLECTION).findOneAndUpdate(
    {
      tokenHash: hashToken(args.rawToken),
      prismaUserId: args.prismaUserId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { lastUsedAt: new Date() } },
  );
  return doc !== null;
}
