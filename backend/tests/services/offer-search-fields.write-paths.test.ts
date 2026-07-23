/**
 * Write paths stamp the derived search fields (descriptionText + base cashback
 * range) so the stored values never drift from the priced variants:
 *   - updateOffer (description edit, variant/deal-price edit)
 *   - setNexusFeePct (fee re-bake moves member_price)
 *   - setVariantBaseSalePrice (single-variant re-bake)
 * Uses the in-memory Mongo from globalSetup.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { updateOffer } from '../../src/services/supply.service';
import { setNexusFeePct, setVariantBaseSalePrice } from '../../src/services/nexus-fee.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';

let client: MongoClient;
const OWNER = 'tOwner';

/** Insert a minimal voucher offer document (raw, no Zod). */
async function seedVoucher(fields: Record<string, unknown> = {}): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    offerId: 'o1', title: 'Offer', description: '<p>old</p>', category: 'other',
    executionType: 'voucher', status: 'active', visibility: 'tenant_only',
    createdByTenantId: OWNER, nexusFeePct: 10,
    face_value: 100, nexus_cost: 50, member_price: 55, displayPrice: 55,
    variants: [
      { variantId: 'var_aaaaaaaaaaaa', face_value: 100, nexus_cost: 50, member_price: 55, voucherStackable: null, sku: null, tags: [] },
    ],
    imageUrls: [], createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`offer_search_fields_${Date.now()}`);
});
afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});
beforeEach(async () => {
  await getSupplyDomainCollections(db).nexusOffers.deleteMany({});
  await getSupplyDomainCollections(db).tenantOfferConfigs.deleteMany({});
  await seedVoucher();
});

async function loadOffer() {
  return getSupplyDomainCollections(db).nexusOffers.findOne({ offerId: 'o1' });
}

describe('updateOffer stamps the derived search fields', () => {
  it('description edit rewrites descriptionText (HTML stripped)', async () => {
    const res = await updateOffer('o1', OWNER, { description: '<h2>New</h2><p>rich <b>text</b></p>' });
    expect(res?.offer).toBeTruthy();
    const offer = await loadOffer();
    expect(offer?.descriptionText).toBe('New rich text');
  });

  it('a non-description edit still recomputes cashback and leaves descriptionText alone', async () => {
    const res = await updateOffer('o1', OWNER, { title: 'Renamed' });
    expect(res?.offer).toBeTruthy();
    const offer = await loadOffer();
    expect(offer?.descriptionText).toBeUndefined(); // pre-backfill doc, no description sent
    expect(offer?.cashbackMinPct).toBe(45); // (100-55)/100
    expect(offer?.cashbackMaxPct).toBe(45);
  });

  it('a variant edit moves the cashback range', async () => {
    const res = await updateOffer('o1', OWNER, {
      variants: [
        { variantId: 'var_aaaaaaaaaaaa', face_value: 100, nexus_cost: 50 },  // bakes to 55 -> 45%
        { face_value: 500, nexus_cost: 480 },                                 // bakes to 482 -> 4%
      ],
    });
    expect(res?.offer).toBeTruthy();
    const offer = await loadOffer();
    expect(offer?.cashbackMinPct).toBe(4);
    expect(offer?.cashbackMaxPct).toBe(45);
  });
});

describe('nexus-fee write paths stamp the cashback range', () => {
  it('setNexusFeePct re-bake moves the range', async () => {
    const res = await setNexusFeePct('o1', 0); // member_price re-bakes to 50 -> 50%
    expect(res.ok).toBe(true);
    const offer = await loadOffer();
    expect(offer?.cashbackMinPct).toBe(50);
    expect(offer?.cashbackMaxPct).toBe(50);
  });

  it('setVariantBaseSalePrice re-bake moves the range', async () => {
    const res = await setVariantBaseSalePrice('o1', 'var_aaaaaaaaaaaa', 90); // bakes to 91 -> 9%
    expect(res.ok).toBe(true);
    const offer = await loadOffer();
    expect(offer?.cashbackMinPct).toBe(9);
    expect(offer?.cashbackMaxPct).toBe(9);
  });
});
