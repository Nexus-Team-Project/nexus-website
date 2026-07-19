/**
 * setNexusFeePct: stamps the offer's fee %, re-bakes every variant's
 * member_price (ceil(cost + pct% of margin), capped at face), re-mirrors the
 * representative variant + displayPrice, and re-syncs adopter overrides.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { setNexusFeePct } from '../../src/services/nexus-fee.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db('nexus_fee_service_test');
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await Promise.all([
    getSupplyDomainCollections(db).nexusOffers.deleteMany({}),
    getSupplyDomainCollections(db).tenantOfferConfigs.deleteMany({}),
  ]);
});

async function seedVoucher(offerId: string, fields: Record<string, unknown> = {}): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    offerId, title: offerId, createdByTenantId: 't_owner', createdByIdentityId: 'id_owner',
    visibility: 'ecosystem', status: 'active', deletedAt: null, executionType: 'voucher',
    nexusFeePct: 10, face_value: 500, nexus_cost: 200, member_price: 230, displayPrice: 55,
    variants: [
      { variantId: 'var_aaaaaaaaaaaa', face_value: 500, nexus_cost: 200, member_price: 230, voucherStackable: null, sku: null, tags: [] },
      { variantId: 'var_bbbbbbbbbbbb', face_value: 100, nexus_cost: 50, member_price: 55, voucherStackable: null, sku: null, tags: [] },
    ],
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

describe('setNexusFeePct', () => {
  it('re-bakes every variant member_price + mirror + displayPrice', async () => {
    await seedVoucher('o1');
    const res = await setNexusFeePct('o1', 20);
    expect(res.ok).toBe(true);
    const offer = await getSupplyDomainCollections(db).nexusOffers.findOne({ offerId: 'o1' });
    expect(offer?.nexusFeePct).toBe(20);
    expect(offer?.variants?.map((v) => v.member_price)).toEqual([260, 60]); // 200+60, 50+10
    expect(offer?.displayPrice).toBe(60);         // lowest baked member_price
    expect(offer?.member_price).toBe(60);         // representative mirror
  });

  it('pct 0 restores the raw sale prices', async () => {
    await seedVoucher('o2');
    await setNexusFeePct('o2', 0);
    const offer = await getSupplyDomainCollections(db).nexusOffers.findOne({ offerId: 'o2' });
    expect(offer?.variants?.map((v) => v.member_price)).toEqual([200, 50]);
  });

  it('snaps an adopter override below the new floor', async () => {
    await seedVoucher('o3');
    await getSupplyDomainCollections(db).tenantOfferConfigs.insertOne({
      configId: 'c1', tenantId: 't_a', offerId: 'o3', adoptionStatus: 'active',
      variantPrices: { var_aaaaaaaaaaaa: 240 }, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    await setNexusFeePct('o3', 20); // new floor for var_a = 260
    const cfg = await getSupplyDomainCollections(db).tenantOfferConfigs.findOne({ configId: 'c1' });
    expect(cfg?.variantPrices?.var_aaaaaaaaaaaa).toBe(260);
  });

  it('rejects non-voucher and unknown offers', async () => {
    await seedVoucher('o4', { executionType: 'discount_code' });
    expect((await setNexusFeePct('o4', 10))).toEqual({ ok: false, reason: 'not_voucher' });
    expect((await setNexusFeePct('missing', 10))).toEqual({ ok: false, reason: 'offer_not_found' });
  });
});
