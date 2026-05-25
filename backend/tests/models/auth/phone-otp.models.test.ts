/**
 * Tests for the phoneOtpChallenges collection model.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.2
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import {
  ensurePhoneOtpIndexes,
  PHONE_OTP_COLLECTION,
} from '../../../src/models/auth/phone-otp.models';

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

describe('ensurePhoneOtpIndexes', () => {
  it('creates TTL on expiresAt and phone lookup index', async () => {
    await ensurePhoneOtpIndexes(db);
    const idx = await db.collection(PHONE_OTP_COLLECTION).indexes();
    const expiresIdx = idx.find((i) => i.name === 'expiresAt_ttl');
    expect(expiresIdx?.expireAfterSeconds).toBe(0);
    expect(idx.some((i) => i.name === 'phone_lookup')).toBe(true);
  });
});
