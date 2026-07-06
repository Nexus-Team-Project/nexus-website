/**
 * Tests trusted-device issue + recognition: happy match, wrong token,
 * wrong user, expiry, revocation, and lastUsedAt touch.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { issueTrustedDevice, isTrustedDevice } from '../../../src/services/auth/trusted-device.service';
import { TRUSTED_DEVICE_COLLECTION } from '../../../src/models/auth/trusted-device.models';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(TRUSTED_DEVICE_COLLECTION).deleteMany({});
});

describe('trusted devices', () => {
  it('issued token is recognized for its user and touches lastUsedAt', async () => {
    const raw = await issueTrustedDevice(db, { prismaUserId: 'u1', userAgent: 'UA', ipAddress: '1.1.1.1' });
    expect(raw.length).toBeGreaterThanOrEqual(64);
    const before = await db.collection(TRUSTED_DEVICE_COLLECTION).findOne({ prismaUserId: 'u1' });
    await new Promise((r) => setTimeout(r, 5));
    expect(await isTrustedDevice(db, { prismaUserId: 'u1', rawToken: raw })).toBe(true);
    const after = await db.collection(TRUSTED_DEVICE_COLLECTION).findOne({ prismaUserId: 'u1' });
    expect(after!.lastUsedAt.getTime()).toBeGreaterThan(before!.lastUsedAt.getTime());
  });

  it("rejects a wrong token, a missing token, and another user's token", async () => {
    const raw = await issueTrustedDevice(db, { prismaUserId: 'u1', userAgent: null, ipAddress: null });
    expect(await isTrustedDevice(db, { prismaUserId: 'u1', rawToken: 'garbage' })).toBe(false);
    expect(await isTrustedDevice(db, { prismaUserId: 'u1', rawToken: null })).toBe(false);
    expect(await isTrustedDevice(db, { prismaUserId: 'u2', rawToken: raw })).toBe(false);
  });

  it('rejects expired and revoked devices', async () => {
    const raw = await issueTrustedDevice(db, { prismaUserId: 'u1', userAgent: null, ipAddress: null });
    await db.collection(TRUSTED_DEVICE_COLLECTION).updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await isTrustedDevice(db, { prismaUserId: 'u1', rawToken: raw })).toBe(false);

    const raw2 = await issueTrustedDevice(db, { prismaUserId: 'u1', userAgent: null, ipAddress: null });
    await db.collection(TRUSTED_DEVICE_COLLECTION).updateMany(
      { expiresAt: { $gt: new Date() } },
      { $set: { revokedAt: new Date() } },
    );
    expect(await isTrustedDevice(db, { prismaUserId: 'u1', rawToken: raw2 })).toBe(false);
  });
});
