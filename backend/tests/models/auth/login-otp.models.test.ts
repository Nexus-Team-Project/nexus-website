/**
 * Verifies the loginOtpChallenges indexes: TTL on expiresAt, unique
 * challengeTokenHash, and the email lookup index.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { ensureLoginOtpIndexes, LOGIN_OTP_COLLECTION } from '../../../src/models/auth/login-otp.models';

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

describe('login OTP indexes', () => {
  it('creates ttl, unique-token, and email indexes idempotently', async () => {
    await ensureLoginOtpIndexes(db);
    await ensureLoginOtpIndexes(db); // idempotent second run
    const idx = await db.collection(LOGIN_OTP_COLLECTION).indexes();
    const names = idx.map((i) => i.name);
    expect(names).toContain('expiresAt_ttl');
    expect(names).toContain('challengeTokenHash_unique');
    expect(names).toContain('email_lookup');
    expect(idx.find((i) => i.name === 'challengeTokenHash_unique')?.unique).toBe(true);
  });
});
