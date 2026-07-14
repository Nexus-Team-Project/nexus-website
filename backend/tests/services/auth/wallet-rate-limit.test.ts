/**
 * Tests for the Mongo-backed wallet rate-limit helper.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.6
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import {
  assertRateLimit,
  countRecentEvents,
  recordEvent,
} from '../../../src/services/auth/wallet-rate-limit';

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

describe('countRecentEvents + recordEvent', () => {
  it('counts only events inside the window for the exact (bucket, key)', async () => {
    await recordEvent(db, { bucket: 'pwd_fail', key: 'a@b.com' });
    await recordEvent(db, { bucket: 'pwd_fail', key: 'a@b.com' });
    expect(
      await countRecentEvents(db, { bucket: 'pwd_fail', key: 'a@b.com', windowSec: 900 }),
    ).toBe(2);
    expect(
      await countRecentEvents(db, { bucket: 'pwd_fail', key: 'other@b.com', windowSec: 900 }),
    ).toBe(0);
    expect(
      await countRecentEvents(db, { bucket: 'other_bucket', key: 'a@b.com', windowSec: 900 }),
    ).toBe(0);
  });

  it('excludes events older than the window', async () => {
    await recordEvent(db, { bucket: 'pwd_fail', key: 'a@b.com' });
    await db
      .collection('walletRateLimits')
      .updateMany(
        { bucket: 'pwd_fail', key: 'a@b.com' },
        { $set: { createdAt: new Date(Date.now() - 1000 * 1000) } },
      );
    expect(
      await countRecentEvents(db, { bucket: 'pwd_fail', key: 'a@b.com', windowSec: 900 }),
    ).toBe(0);
  });
});
