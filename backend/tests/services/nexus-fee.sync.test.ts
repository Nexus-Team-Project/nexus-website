/**
 * syncTenantPricesToFeeFloor: after a fee change re-bakes variant member_price,
 * adopter overrides BELOW the new floor snap UP to it, overrides above are
 * preserved, and the config's cached displayPrice is recomputed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { syncTenantPricesToFeeFloor } from '../../src/services/tenant-pricing.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';
import type { OfferVariant } from '../../src/models/domain/supply.models';

let client: MongoClient;

// New bounds after a fee bump to 20%: cost 200 face 500 -> floor 260.
const variants: OfferVariant[] = [
  { variantId: 'var_aaaaaaaaaaaa', face_value: 500, nexus_cost: 200, member_price: 260, voucherStackable: null, sku: null, tags: [] },
];

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db('nexus_fee_sync_test');
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await getSupplyDomainCollections(db).tenantOfferConfigs.deleteMany({});
});

async function seedConfig(configId: string, variantPrices: Record<string, number>): Promise<void> {
  await getSupplyDomainCollections(db).tenantOfferConfigs.insertOne({
    configId, tenantId: `t_${configId}`, offerId: 'offer_1', adoptionStatus: 'active',
    variantPrices, createdAt: new Date(), updatedAt: new Date(),
  } as never);
}

describe('syncTenantPricesToFeeFloor', () => {
  it('snaps an override below the new floor UP to it', async () => {
    await seedConfig('c1', { var_aaaaaaaaaaaa: 230 }); // below new floor 260
    await syncTenantPricesToFeeFloor('offer_1', variants);
    const cfg = await getSupplyDomainCollections(db).tenantOfferConfigs.findOne({ configId: 'c1' });
    expect(cfg?.variantPrices?.var_aaaaaaaaaaaa).toBe(260);
    expect(cfg?.displayPrice).toBe(260);
  });

  it('preserves an override above the new floor', async () => {
    await seedConfig('c2', { var_aaaaaaaaaaaa: 300 });
    await syncTenantPricesToFeeFloor('offer_1', variants);
    const cfg = await getSupplyDomainCollections(db).tenantOfferConfigs.findOne({ configId: 'c2' });
    expect(cfg?.variantPrices?.var_aaaaaaaaaaaa).toBe(300);
  });

  it('clamps an override above face_value down to it', async () => {
    await seedConfig('c3', { var_aaaaaaaaaaaa: 600 });
    await syncTenantPricesToFeeFloor('offer_1', variants);
    const cfg = await getSupplyDomainCollections(db).tenantOfferConfigs.findOne({ configId: 'c3' });
    expect(cfg?.variantPrices?.var_aaaaaaaaaaaa).toBe(500);
  });
});
