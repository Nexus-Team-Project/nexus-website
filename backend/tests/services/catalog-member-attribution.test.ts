/**
 * Creator-attribution tests for getMemberCatalogView (wallet-store-offer-pages).
 *
 * The member-facing catalog must expose the CREATING tenant's identity on every
 * item (createdByTenantName / LogoUrl / BrandColor / LogoCrop) via the same
 * batch join getTenantCatalogView uses: ONE domainTenants.find({$in}) per page
 * (no N+1), with the "NEXUS" fallback for a missing creator doc. Pricing,
 * gating, and nexus_cost stripping are unchanged and re-asserted here.
 *
 * Uses the in-memory Mongo from tests/setup with getMongoDb pointed at it.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db, Collection } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { getMemberCatalogView } from '../../src/services/catalog.service';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

let client: MongoClient;
const MEMBER_TENANT = 't_member';
const CREATOR_A = 't_creator_a';
const CREATOR_B = 't_creator_b';

/** Insert a minimal active offer (raw, no Zod). */
async function seedOffer(fields: Record<string, unknown>): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    title: 'Offer', description: '', category: 'other', executionType: 'giftcard',
    status: 'active', visibility: 'ecosystem', market_price: 100, member_price: 90,
    nexus_cost: 70, imageUrls: [], createdAt: new Date(), updatedAt: new Date(),
    ...fields,
  } as never);
}

/** Mark an offer adopted by the member tenant. */
async function seedAdoption(offerId: string): Promise<void> {
  await getSupplyDomainCollections(db).tenantOfferConfigs.insertOne({
    tenantOfferConfigId: `toc_${offerId}`, tenantId: MEMBER_TENANT, offerId,
    adoptionStatus: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as never);
}

/** Insert a creating-tenant doc with branding. */
async function seedCreator(tenantId: string, fields: Record<string, unknown> = {}): Promise<void> {
  await db.collection(DOMAIN_COLLECTIONS.domainTenants).insertOne({
    tenantId, organizationName: `Org ${tenantId}`, status: 'active', plan: 'basic',
    createdByIdentityId: 'id_1', createdAt: new Date(), updatedAt: new Date(),
    ...fields,
  });
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_member_attribution_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);
  await nexusOffers.deleteMany({});
  await tenantOfferConfigs.deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.domainTenants).deleteMany({});
});

describe('getMemberCatalogView creator attribution', () => {
  it('exposes the creating tenant name/logo/color/crop on member items', async () => {
    const crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    await seedCreator(CREATOR_A, {
      organizationName: 'Castro', logoUrl: 'https://res.cloudinary.com/c/castro.png',
      brandColor: '#112233', logoCrop: crop,
    });
    await seedOffer({ offerId: 'o1', createdByTenantId: CREATOR_A });
    await seedAdoption('o1');

    const { items } = await getMemberCatalogView(MEMBER_TENANT, { page: 1, limit: 50 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      offerId: 'o1',
      createdByTenantName: 'Castro',
      createdByTenantLogoUrl: 'https://res.cloudinary.com/c/castro.png',
      createdByTenantBrandColor: '#112233',
      createdByTenantLogoCrop: crop,
    });
  });

  it('resolves each item to ITS creator when the page spans multiple creators', async () => {
    await seedCreator(CREATOR_A, { organizationName: 'Org A' });
    await seedCreator(CREATOR_B, { organizationName: 'Org B' });
    await seedOffer({ offerId: 'oa', createdByTenantId: CREATOR_A });
    await seedOffer({ offerId: 'ob', createdByTenantId: CREATOR_B });
    await seedAdoption('oa');
    await seedAdoption('ob');

    const { items } = await getMemberCatalogView(MEMBER_TENANT, { page: 1, limit: 50 });
    const byId = new Map(items.map((i) => [i.offerId, i]));
    expect(byId.get('oa')?.createdByTenantName).toBe('Org A');
    expect(byId.get('ob')?.createdByTenantName).toBe('Org B');
  });

  it('falls back to NEXUS (no logo) when the creator doc is missing, without failing', async () => {
    await seedOffer({ offerId: 'orphan', createdByTenantId: 't_gone' });
    await seedAdoption('orphan');

    const { items } = await getMemberCatalogView(MEMBER_TENANT, { page: 1, limit: 50 });
    expect(items).toHaveLength(1);
    expect(items[0]!.createdByTenantName).toBe('NEXUS');
    expect(items[0]!.createdByTenantLogoUrl).toBeUndefined();
  });

  it('issues a single batched domainTenants query per page (no N+1)', async () => {
    await seedCreator(CREATOR_A);
    await seedCreator(CREATOR_B);
    for (let i = 0; i < 6; i += 1) {
      const creator = i % 2 === 0 ? CREATOR_A : CREATOR_B;
      await seedOffer({ offerId: `o${i}`, createdByTenantId: creator });
      await seedAdoption(`o${i}`);
    }

    // Count find() calls against the domainTenants collection by intercepting
    // db.collection: every wrapper for that name gets a spied find.
    const findCalls: unknown[] = [];
    const realCollection = db.collection.bind(db);
    const collectionSpy = vi.spyOn(db, 'collection').mockImplementation(
      (name: string, ...rest: never[]) => {
        const col = realCollection(name, ...rest) as Collection;
        if (name === DOMAIN_COLLECTIONS.domainTenants) {
          const realFind = col.find.bind(col);
          vi.spyOn(col, 'find').mockImplementation(((...args: unknown[]) => {
            findCalls.push(args);
            return (realFind as (...a: unknown[]) => unknown)(...args);
          }) as never);
        }
        return col;
      },
    );
    try {
      const { items } = await getMemberCatalogView(MEMBER_TENANT, { page: 1, limit: 50 });
      expect(items).toHaveLength(6);
      expect(findCalls).toHaveLength(1);
    } finally {
      collectionSpy.mockRestore();
    }
  });

  it('keeps member pricing projection and nexus_cost stripping unchanged', async () => {
    await seedCreator(CREATOR_A);
    await seedOffer({
      offerId: 'priced', createdByTenantId: CREATOR_A,
      variants: [{
        variantId: 'v1', face_value: 200, member_price: 150, nexus_cost: 100,
        createdAt: new Date(), updatedAt: new Date(),
      }],
    });
    await seedAdoption('priced');

    const { items } = await getMemberCatalogView(MEMBER_TENANT, { page: 1, limit: 50 });
    const item = items[0]!;
    expect(item.createdByTenantName).toBe(`Org ${CREATOR_A}`);
    expect(item.nexus_cost).toBeUndefined();
    expect(item.variants?.[0]?.nexus_cost).toBeUndefined();
    expect(item.variants?.[0]?.member_price).toBe(150);
  });
});
