/**
 * Verifies the trustedDevices indexes: TTL on expiresAt, unique tokenHash,
 * and the per-user lookup index.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { ensureTrustedDeviceIndexes, TRUSTED_DEVICE_COLLECTION } from '../../../src/models/auth/trusted-device.models';

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

describe('trusted device indexes', () => {
  it('creates ttl, unique-token, and user indexes idempotently', async () => {
    await ensureTrustedDeviceIndexes(db);
    await ensureTrustedDeviceIndexes(db); // idempotent second run
    const idx = await db.collection(TRUSTED_DEVICE_COLLECTION).indexes();
    const names = idx.map((i) => i.name);
    expect(names).toContain('expiresAt_ttl');
    expect(names).toContain('tokenHash_unique');
    expect(names).toContain('user_lookup');
    expect(idx.find((i) => i.name === 'tokenHash_unique')?.unique).toBe(true);
  });
});
