/**
 * Tests for the Mongo-backed wallet rate-limit helper.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.6
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { assertRateLimit } from '../../../src/services/auth/wallet-rate-limit';

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
  await db.collection('walletRateLimits').deleteMany({});
});

describe('assertRateLimit', () => {
  it('allows the first attempt under the cap', async () => {
    await expect(
      assertRateLimit(db, {
        bucket: 'phone_otp_send',
        key: '0508465858',
        windowSec: 30,
        max: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a second attempt inside the window', async () => {
    await assertRateLimit(db, {
      bucket: 'phone_otp_send',
      key: '0508465858',
      windowSec: 30,
      max: 1,
    });
    await expect(
      assertRateLimit(db, {
        bucket: 'phone_otp_send',
        key: '0508465858',
        windowSec: 30,
        max: 1,
      }),
    ).rejects.toThrow(/rate_limited:phone_otp_send/);
  });

  it('isolates buckets by name', async () => {
    await assertRateLimit(db, {
      bucket: 'phone_otp_send',
      key: '0508465858',
      windowSec: 30,
      max: 1,
    });
    await expect(
      assertRateLimit(db, {
        bucket: 'email_otp_send',
        key: '0508465858',
        windowSec: 30,
        max: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('isolates keys within a bucket', async () => {
    await assertRateLimit(db, {
      bucket: 'phone_otp_send',
      key: '0508465858',
      windowSec: 30,
      max: 1,
    });
    await expect(
      assertRateLimit(db, {
        bucket: 'phone_otp_send',
        key: '0501111111',
        windowSec: 30,
        max: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
