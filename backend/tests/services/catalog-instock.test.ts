/**
 * buildInStockClause: vouchers are in stock only when they have at least one
 * AVAILABLE voucherCodes unit (offer.stockLimit null must NOT read as
 * "unlimited" for vouchers); non-voucher offers keep the legacy semantics.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { buildInStockClause } from '../../src/services/catalog-query.helper';
import { getVoucherCodeCollection } from '../../src/models/domain/voucher-codes.models';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db('catalog_instock_test');
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await getVoucherCodeCollection(db).deleteMany({});
});

async function seedUnit(offerId: string, status: string): Promise<void> {
  await getVoucherCodeCollection(db).insertOne({
    codeId: `c_${offerId}_${status}_${Math.random().toString(36).slice(2, 8)}`,
    offerId, variantId: 'var_aaaaaaaaaaaa', kind: 'barcode', value: `v${Math.random()}`,
    status, createdAt: new Date(), updatedAt: new Date(),
  } as never);
}

describe('buildInStockClause', () => {
  it('includes only offerIds with AVAILABLE units in the voucher branch', async () => {
    await seedUnit('offer_in', 'available');
    await seedUnit('offer_out', 'redeemed');
    const clause = await buildInStockClause(db) as { $or: Array<Record<string, unknown>> };
    const voucherBranch = clause.$or.find((b) => b.executionType === 'voucher') as
      { offerId: { $in: string[] } };
    expect(voucherBranch.offerId.$in).toContain('offer_in');
    expect(voucherBranch.offerId.$in).not.toContain('offer_out');
  });

  it('keeps the legacy non-voucher branches (null = unlimited, used < limit)', async () => {
    const clause = await buildInStockClause(db) as { $or: Array<Record<string, unknown>> };
    expect(clause.$or).toHaveLength(3);
    const nonVoucher = clause.$or.filter((b) =>
      JSON.stringify(b.executionType) === JSON.stringify({ $ne: 'voucher' }));
    expect(nonVoucher).toHaveLength(2);
  });
});
