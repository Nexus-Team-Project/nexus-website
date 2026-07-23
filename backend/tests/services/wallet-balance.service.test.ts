/**
 * Tests for the wallet balance service: lazy 0 default (no write on read),
 * upserting adjustments, and the no-negative-balance guard.
 * Balance feature: dedicated walletBalances collection, agorot ILS.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { getBalance, adjustBalance } from '../../src/services/wallet/balance.service';
import { WALLET_BALANCES_COLLECTION } from '../../src/models/payments/wallet-payments.models';

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`wallet_balance_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(WALLET_BALANCES_COLLECTION).deleteMany({});
});

describe('getBalance', () => {
  it('returns 0 for a new member WITHOUT creating a doc', async () => {
    const view = await getBalance('newbie');
    expect(view).toEqual({ balanceAgorot: 0, currency: 'ILS' });
    expect(await db.collection(WALLET_BALANCES_COLLECTION).countDocuments({})).toBe(0);
  });
});

describe('adjustBalance', () => {
  it('upserts on first credit, then reads back the stored balance', async () => {
    const after = await adjustBalance('u1', 5000);
    expect(after.balanceAgorot).toBe(5000);
    expect((await getBalance('u1')).balanceAgorot).toBe(5000);
  });

  it('accumulates across adjustments and allows spending down to exactly 0', async () => {
    await adjustBalance('u2', 5000);
    await adjustBalance('u2', 2500);
    expect((await getBalance('u2')).balanceAgorot).toBe(7500);
    const after = await adjustBalance('u2', -7500);
    expect(after.balanceAgorot).toBe(0);
  });

  it('refuses to go negative', async () => {
    await adjustBalance('u3', 1000);
    await expect(adjustBalance('u3', -1500)).rejects.toThrow('insufficient_balance');
    expect((await getBalance('u3')).balanceAgorot).toBe(1000);
  });
});
