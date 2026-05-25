/**
 * Tests for the emailOtpChallenges collection model.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.3
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import {
  ensureEmailOtpIndexes,
  EMAIL_OTP_COLLECTION,
} from '../../../src/models/auth/email-otp.models';

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

describe('ensureEmailOtpIndexes', () => {
  it('creates TTL on expiresAt and email lookup index', async () => {
    await ensureEmailOtpIndexes(db);
    const idx = await db.collection(EMAIL_OTP_COLLECTION).indexes();
    expect(idx.find((i) => i.name === 'expiresAt_ttl')?.expireAfterSeconds).toBe(0);
    expect(idx.some((i) => i.name === 'email_lookup')).toBe(true);
  });
});
