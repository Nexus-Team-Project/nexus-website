/**
 * Scope tests for getTenantCatalogView (Phase 2 M5).
 *
 * The Benefits Partnerships browse view (non-ownedOnly) is the tenant's GLOBAL
 * catalog: it must return ecosystem offers from any uploader (including the
 * caller's own ecosystem offers) but NOT any tenant_only offers - not the
 * caller's own, and not one that named the caller as invitedByTenantId. The
 * ownedOnly view (Product Catalog) still returns everything the caller created.
 *
 * Uses the in-memory Mongo from tests/setup with getMongoDb pointed at it.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { getTenantCatalogView, getTenantOfferDetail } from '../../src/services/catalog.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';

let client: MongoClient;
const CALLER = 'tA';
const OTHER = 'tOther';

/** Insert a minimal offer (raw, no Zod). */
async function seedOffer(fields: Record<string, unknown>): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    title: 'Offer', description: '', category: 'other', executionType: 'giftcard',
    status: 'active', market_price: 100, member_price: 90, imageUrls: [],
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

/** offerIds returned by the browse (global) view. */
async function browseIds(): Promise<string[]> {
  const res = await getTenantCatalogView(CALLER, { page: 1, limit: 50 });
  return res.items.map((i) => i.offerId);
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_catalog_scope_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await getSupplyDomainCollections(db).nexusOffers.deleteMany({});
});

describe('getTenantCatalogView browse scope (global-only)', () => {
  beforeEach(async () => {
    await seedOffer({ offerId: 'eco_other', visibility: 'ecosystem', createdByTenantId: OTHER });
    await seedOffer({ offerId: 'eco_own', visibility: 'ecosystem', createdByTenantId: CALLER });
    await seedOffer({ offerId: 'ten_own', visibility: 'tenant_only', createdByTenantId: CALLER, invitedByTenantId: CALLER });
    await seedOffer({ offerId: 'ten_invited', visibility: 'tenant_only', createdByTenantId: OTHER, invitedByTenantId: CALLER });
  });

  it('returns ecosystem offers (incl. the caller’s own) but no tenant_only offers', async () => {
    const ids = await browseIds();
    expect(ids).toContain('eco_other');
    expect(ids).toContain('eco_own');
    expect(ids).not.toContain('ten_own');       // own tenant_only belongs to Product Catalog
    expect(ids).not.toContain('ten_invited');   // invited tenant_only no longer shown here
  });

  it('marks the caller’s own ecosystem offer as not adopted by default', async () => {
    const res = await getTenantCatalogView(CALLER, { page: 1, limit: 50 });
    const own = res.items.find((i) => i.offerId === 'eco_own');
    expect(own?.isAdopted).toBe(false);
  });

  it('ownedOnly view still returns everything the caller created', async () => {
    const res = await getTenantCatalogView(CALLER, { page: 1, limit: 50, ownedOnly: true });
    const ids = res.items.map((i) => i.offerId);
    expect(ids.sort()).toEqual(['eco_own', 'ten_own']);
  });
});

describe('getTenantOfferDetail (single-offer, edit flow)', () => {
  beforeEach(async () => {
    await seedOffer({ offerId: 'eco_other', visibility: 'ecosystem', createdByTenantId: OTHER });
    await seedOffer({ offerId: 'eco_own', visibility: 'ecosystem', createdByTenantId: CALLER });
    await seedOffer({ offerId: 'ten_own', visibility: 'tenant_only', createdByTenantId: CALLER });
    await seedOffer({ offerId: 'eco_pending_other', visibility: 'ecosystem', status: 'pending_approval', createdByTenantId: OTHER });
    await seedOffer({ offerId: 'ten_other', visibility: 'tenant_only', createdByTenantId: OTHER, invitedByTenantId: CALLER });
  });

  it('returns the caller’s own offers of ANY visibility (incl. tenant_only)', async () => {
    expect((await getTenantOfferDetail(CALLER, 'ten_own'))?.offerId).toBe('ten_own');
    expect((await getTenantOfferDetail(CALLER, 'eco_own'))?.offerId).toBe('eco_own');
  });

  it('returns an active ecosystem offer from another uploader', async () => {
    expect((await getTenantOfferDetail(CALLER, 'eco_other'))?.offerId).toBe('eco_other');
  });

  it('hides another tenant’s tenant_only offer and their pending ecosystem offer', async () => {
    expect(await getTenantOfferDetail(CALLER, 'ten_other')).toBeNull();
    expect(await getTenantOfferDetail(CALLER, 'eco_pending_other')).toBeNull();
  });

  it('lets a platform admin see any offer (incl. another tenant’s pending)', async () => {
    expect((await getTenantOfferDetail(CALLER, 'eco_pending_other', { isPlatformAdmin: true }))?.offerId).toBe('eco_pending_other');
  });

  it('returns null for a missing offer', async () => {
    expect(await getTenantOfferDetail(CALLER, 'nope')).toBeNull();
  });
});
