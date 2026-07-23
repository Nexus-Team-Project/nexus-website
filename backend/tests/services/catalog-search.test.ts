/**
 * catalog-search module through the wallet feeds (regex fallback engine - the
 * env flag is off in tests, so CI exercises the exact non-Atlas route path):
 *   - text matches title / descriptionText (never raw HTML markup)
 *   - tenant-name + business-description matches return that creator's offers
 *   - stackable tri-state, cashback sorts (base + per-tenant effective,
 *     nulls last both directions), Hebrew title sort
 *   - context gates hold under search (member feed only returns adopted)
 *   - paramless requests behave like the pre-module feeds (newest order)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { getMemberCatalogView, type CatalogQuery } from '../../src/services/catalog.service';
import { getEcosystemCatalogView } from '../../src/services/wallet/ecosystem-catalog-view.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';
import { getTenantDomainCollections } from '../../src/models/domain';

let client: MongoClient;

const baseQuery: CatalogQuery = { page: 1, limit: 25 };

/** Seed one active ecosystem voucher offer (raw insert, no Zod). */
async function seedOffer(offerId: string, fields: Record<string, unknown> = {}): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    offerId, title: offerId, description: '', descriptionText: '',
    category: 'other', executionType: 'voucher', status: 'active',
    visibility: 'ecosystem', createdByTenantId: 'tCreator', deletedAt: null,
    imageUrls: [], createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

async function seedTenant(tenantId: string, fields: Record<string, unknown> = {}): Promise<void> {
  await getTenantDomainCollections(db).domainTenants.insertOne({
    tenantId, organizationName: tenantId, status: 'active',
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

async function adopt(tenantId: string, offerId: string, fields: Record<string, unknown> = {}): Promise<void> {
  await getSupplyDomainCollections(db).tenantOfferConfigs.insertOne({
    configId: `cfg_${tenantId}_${offerId}`, tenantId, offerId, adoptionStatus: 'active',
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`catalog_search_${Date.now()}`);
});
afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});
beforeEach(async () => {
  await Promise.all([
    getSupplyDomainCollections(db).nexusOffers.deleteMany({}),
    getSupplyDomainCollections(db).tenantOfferConfigs.deleteMany({}),
    getTenantDomainCollections(db).domainTenants.deleteMany({}),
  ]);
});

describe('ecosystem feed text search (regex engine)', () => {
  it('matches title and descriptionText, never raw HTML markup', async () => {
    await seedOffer('by-title', { title: 'Aroma Coffee deal' });
    await seedOffer('by-desc', { descriptionText: 'free coffee refill included' });
    await seedOffer('by-markup-only', {
      description: '<span style="coffee">nothing</span>', descriptionText: 'nothing',
    });
    const page = await getEcosystemCatalogView({ ...baseQuery, search: 'coffee' });
    const ids = page.items.map((i) => i.offerId).sort();
    expect(ids).toEqual(['by-desc', 'by-title']);
    expect(page.total).toBe(2);
  });

  it('a tenant name or business description match returns that creator offers', async () => {
    await seedTenant('tNeto', { organizationName: 'Cafe Neto' });
    await seedTenant('tVegan', { organizationName: 'Plain Org', businessDescription: 'vegan bakery downtown' });
    await seedOffer('neto-offer', { createdByTenantId: 'tNeto', title: 'gift card' });
    await seedOffer('vegan-offer', { createdByTenantId: 'tVegan', title: 'gift card' });
    await seedOffer('other-offer', { createdByTenantId: 'tCreator', title: 'gift card' });

    const byName = await getEcosystemCatalogView({ ...baseQuery, search: 'neto' });
    expect(byName.items.map((i) => i.offerId)).toEqual(['neto-offer']);

    const byDescription = await getEcosystemCatalogView({ ...baseQuery, search: 'vegan' });
    expect(byDescription.items.map((i) => i.offerId)).toEqual(['vegan-offer']);
  });

  it('search never leaks gated offers (inactive/tenant_only)', async () => {
    await seedOffer('visible', { title: 'sushi festival' });
    await seedOffer('inactive', { title: 'sushi festival', status: 'inactive' });
    await seedOffer('private', { title: 'sushi festival', visibility: 'tenant_only' });
    const page = await getEcosystemCatalogView({ ...baseQuery, search: 'sushi' });
    expect(page.items.map((i) => i.offerId)).toEqual(['visible']);
  });
});

describe('stackable tri-state', () => {
  beforeEach(async () => {
    await seedOffer('mixed', {
      variants: [
        { variantId: 'var_aaaaaaaaaaaa', face_value: 100, member_price: 80, voucherStackable: true, tags: [] },
        { variantId: 'var_bbbbbbbbbbbb', face_value: 200, member_price: 150, voucherStackable: false, tags: [] },
      ],
    });
    await seedOffer('flat-stackable', { voucherStackable: true });
    await seedOffer('no-signal', { executionType: 'product', voucherStackable: null });
  });

  it('with = any stackable variant (offer-level fallback), mixed matches both', async () => {
    const withStacking = await getEcosystemCatalogView({ ...baseQuery, stackable: 'with' });
    expect(withStacking.items.map((i) => i.offerId).sort()).toEqual(['flat-stackable', 'mixed']);
    const withoutStacking = await getEcosystemCatalogView({ ...baseQuery, stackable: 'without' });
    expect(withoutStacking.items.map((i) => i.offerId)).toEqual(['mixed']);
  });

  it('no stackable signal appears only when the filter is absent', async () => {
    const all = await getEcosystemCatalogView(baseQuery);
    expect(all.items.map((i) => i.offerId)).toContain('no-signal');
  });
});

describe('cashback sorts', () => {
  beforeEach(async () => {
    await seedOffer('cb-low', { cashbackMinPct: 5, cashbackMaxPct: 5, createdAt: new Date('2026-01-01') });
    await seedOffer('cb-range', { cashbackMinPct: 10, cashbackMaxPct: 40, createdAt: new Date('2026-01-02') });
    await seedOffer('cb-none', { cashbackMinPct: null, cashbackMaxPct: null, createdAt: new Date('2026-01-03') });
  });

  it('desc anchors on max, nulls last', async () => {
    const page = await getEcosystemCatalogView({ ...baseQuery, sort: 'cashback_desc' });
    expect(page.items.map((i) => i.offerId)).toEqual(['cb-range', 'cb-low', 'cb-none']);
  });

  it('asc anchors on min, nulls still last', async () => {
    const page = await getEcosystemCatalogView({ ...baseQuery, sort: 'cashback_asc' });
    expect(page.items.map((i) => i.offerId)).toEqual(['cb-low', 'cb-range', 'cb-none']);
  });

  it('member feed ranks by the tenant EFFECTIVE cashback (override beats base)', async () => {
    // Base: cb-low 5%, cb-range up to 40%. Tenant override reprices cb-range's
    // variant to face value -> its effective cashback disappears -> sorts last.
    await getSupplyDomainCollections(db).nexusOffers.updateOne(
      { offerId: 'cb-range' },
      {
        $set: {
          variants: [
            { variantId: 'var_cccccccccccc', face_value: 100, member_price: 60, voucherStackable: null, tags: [] },
          ],
        },
      },
    );
    await adopt('tMember', 'cb-low');
    await adopt('tMember', 'cb-range', { variantPrices: { var_cccccccccccc: 100 } });
    const page = await getMemberCatalogView('tMember', { ...baseQuery, sort: 'cashback_desc' });
    expect(page.items.map((i) => i.offerId)).toEqual(['cb-low', 'cb-range']);
  });
});

describe('title sort + member gating + paramless behavior', () => {
  it('title_asc orders Hebrew titles by the alef-bet', async () => {
    await seedOffer('t-gimel', { title: 'גלידה' });
    await seedOffer('t-alef', { title: 'ארוחה' });
    await seedOffer('t-bet', { title: 'בורגר' });
    const page = await getEcosystemCatalogView({ ...baseQuery, sort: 'title_asc' });
    expect(page.items.map((i) => i.title)).toEqual(['ארוחה', 'בורגר', 'גלידה']);
  });

  it('member feed returns only adopted offers even when search matches more', async () => {
    await seedOffer('adopted-match', { title: 'pizza night' });
    await seedOffer('unadopted-match', { title: 'pizza night' });
    await adopt('tMember', 'adopted-match');
    const page = await getMemberCatalogView('tMember', { ...baseQuery, search: 'pizza' });
    expect(page.items.map((i) => i.offerId)).toEqual(['adopted-match']);
  });

  it('paramless request keeps the pre-module newest-first behavior', async () => {
    await seedOffer('older', { createdAt: new Date('2026-01-01') });
    await seedOffer('newer', { createdAt: new Date('2026-02-01') });
    const page = await getEcosystemCatalogView(baseQuery);
    expect(page.items.map((i) => i.offerId)).toEqual(['newer', 'older']);
    expect(page.total).toBe(2);
  });

  it('pagination slices and counts the full match set', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await seedOffer(`p${i}`, { createdAt: new Date(2026, 0, i) });
    }
    const page2 = await getEcosystemCatalogView({ page: 2, limit: 2 });
    expect(page2.items.map((i) => i.offerId)).toEqual(['p3', 'p2']);
    expect(page2.total).toBe(5);
  });
});
