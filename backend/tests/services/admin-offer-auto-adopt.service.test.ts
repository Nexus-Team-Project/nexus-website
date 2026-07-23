/**
 * Behavioral tests for admin-offer auto-adopt (admin-offer-auto-adopt.service):
 *   - autoAdoptOfferForAllTenants: fan-out to eligible tenants only, never
 *     touches existing config rows, no-ops on non-admin offers.
 *   - autoAdoptAdminOffersForTenant: catch-up adopts only missing offers,
 *     respects 'excluded', dryRun counts without writing, 0 when ineligible.
 *   - setAutoAdoptAdminOffers: disable flips flag only; enable flips + catches up.
 *   - Price seeding matches adoptOffer's for the same offer.
 *
 * Uses the in-memory Mongo from tests/setup; getMongoDb is pointed at a
 * dedicated test db.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import {
  autoAdoptOfferForAllTenants,
  autoAdoptAdminOffersForTenant,
  setAutoAdoptAdminOffers,
} from '../../src/services/admin-offer-auto-adopt.service';
import { adoptOffer } from '../../src/services/catalog.service';
import { getTenantDomainCollections } from '../../src/models/domain';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';

let client: MongoClient;

/** Insert a minimal domain tenant (raw, no Zod). */
async function seedTenant(tenantId: string, fields: Record<string, unknown> = {}): Promise<void> {
  await getTenantDomainCollections(db).domainTenants.insertOne({
    tenantId, organizationName: tenantId, status: 'build_mode', createdByIdentityId: 'id_owner',
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

/** Insert a benefits_catalog activation for a tenant. */
async function seedActivation(tenantId: string, status: 'active' | 'suspended' = 'active'): Promise<void> {
  await getTenantDomainCollections(db).tenantServiceActivations.insertOne({
    tenantServiceActivationId: `tsa_${tenantId}`, tenantId, serviceKey: 'benefits_catalog',
    status, createdAt: new Date(), updatedAt: new Date(),
  } as never);
}

/** Insert an offer. Defaults to a valid ADMIN offer; override fields to break it. */
async function seedOffer(offerId: string, fields: Record<string, unknown> = {}): Promise<void> {
  await getSupplyDomainCollections(db).nexusOffers.insertOne({
    offerId, title: offerId, createdByTenantId: 'tenant_owner', createdByIdentityId: 'id_owner',
    uploadedByIdentityId: 'id_admin', visibility: 'ecosystem', status: 'active', deletedAt: null,
    executionType: 'voucher', member_price: 50, market_price: 80,
    createdAt: new Date(), updatedAt: new Date(), ...fields,
  } as never);
}

/** Read a tenant's config row for an offer. */
async function config(tenantId: string, offerId: string) {
  return getSupplyDomainCollections(db).tenantOfferConfigs.findOne({ tenantId, offerId });
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db('admin_offer_auto_adopt_test');
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await Promise.all([
    getTenantDomainCollections(db).domainTenants.deleteMany({}),
    getTenantDomainCollections(db).tenantServiceActivations.deleteMany({}),
    getSupplyDomainCollections(db).nexusOffers.deleteMany({}),
    getSupplyDomainCollections(db).tenantOfferConfigs.deleteMany({}),
  ]);
});

describe('autoAdoptOfferForAllTenants', () => {
  it('adopts for eligible tenants only', async () => {
    await seedTenant('t_ok'); await seedActivation('t_ok');
    await seedTenant('t_optout', { autoAdoptAdminOffers: false }); await seedActivation('t_optout');
    await seedTenant('t_suspended'); await seedActivation('t_suspended', 'suspended');
    await seedTenant('t_noservice');
    await seedOffer('o1');

    const count = await autoAdoptOfferForAllTenants('o1');

    expect(count).toBe(1);
    expect((await config('t_ok', 'o1'))?.adoptionStatus).toBe('active');
    expect(await config('t_optout', 'o1')).toBeNull();
    expect(await config('t_suspended', 'o1')).toBeNull();
    expect(await config('t_noservice', 'o1')).toBeNull();
  });

  it('never modifies an existing config row (excluded stays excluded)', async () => {
    await seedTenant('t1'); await seedActivation('t1'); await seedOffer('o1');
    const adoptedAt = new Date('2026-01-01');
    await getSupplyDomainCollections(db).tenantOfferConfigs.insertOne({
      configId: 'c1', tenantId: 't1', offerId: 'o1', adoptionStatus: 'excluded',
      adoptedAt, adoptedByIdentityId: 'id_original',
    } as never);

    const count = await autoAdoptOfferForAllTenants('o1');

    expect(count).toBe(0);
    const row = await config('t1', 'o1');
    expect(row?.adoptionStatus).toBe('excluded');
    expect(row?.adoptedByIdentityId).toBe('id_original');
    expect(row?.adoptedAt).toEqual(adoptedAt);
  });

  it('no-ops for non-admin, tenant_only, inactive, and deleted offers', async () => {
    await seedTenant('t1'); await seedActivation('t1');
    await seedOffer('o_regular');
    await getSupplyDomainCollections(db).nexusOffers.updateOne(
      { offerId: 'o_regular' }, { $unset: { uploadedByIdentityId: '' } });
    await seedOffer('o_tenant_only', { visibility: 'tenant_only' });
    await seedOffer('o_inactive', { status: 'inactive' });
    await seedOffer('o_deleted', { deletedAt: new Date() });

    for (const id of ['o_regular', 'o_tenant_only', 'o_inactive', 'o_deleted', 'o_missing']) {
      expect(await autoAdoptOfferForAllTenants(id)).toBe(0);
    }
    expect(await getSupplyDomainCollections(db).tenantOfferConfigs.countDocuments({})).toBe(0);
  });

  it('seeds the same memberPrice/displayPrice as adoptOffer', async () => {
    await seedTenant('t_auto'); await seedActivation('t_auto');
    await seedTenant('t_manual'); await seedActivation('t_manual');
    await seedOffer('o1', { displayPrice: 60 });

    await autoAdoptOfferForAllTenants('o1');
    await adoptOffer('t_manual', 'o1', 'id_x');

    const auto = await config('t_auto', 'o1');
    const manual = await config('t_manual', 'o1');
    expect(auto?.memberPrice).toBe(manual?.memberPrice);
    expect(auto?.displayPrice).toBe(manual?.displayPrice);
  });
});

describe('autoAdoptAdminOffersForTenant', () => {
  it('adopts only missing admin offers and respects excluded', async () => {
    await seedTenant('t1'); await seedActivation('t1');
    await seedOffer('o_new');
    await seedOffer('o_excluded');
    await seedOffer('o_adopted');
    await getSupplyDomainCollections(db).tenantOfferConfigs.insertMany([
      { configId: 'c1', tenantId: 't1', offerId: 'o_excluded', adoptionStatus: 'excluded', adoptedAt: new Date(), adoptedByIdentityId: 'x' },
      { configId: 'c2', tenantId: 't1', offerId: 'o_adopted', adoptionStatus: 'active', adoptedAt: new Date(), adoptedByIdentityId: 'x' },
    ] as never[]);

    const { adoptedCount } = await autoAdoptAdminOffersForTenant('t1');

    expect(adoptedCount).toBe(1);
    expect((await config('t1', 'o_new'))?.adoptionStatus).toBe('active');
    expect((await config('t1', 'o_excluded'))?.adoptionStatus).toBe('excluded');
  });

  it('returns 0 without writing for ineligible tenants', async () => {
    await seedOffer('o1');
    await seedTenant('t_optout', { autoAdoptAdminOffers: false }); await seedActivation('t_optout');
    await seedTenant('t_noservice');

    expect((await autoAdoptAdminOffersForTenant('t_optout')).adoptedCount).toBe(0);
    expect((await autoAdoptAdminOffersForTenant('t_noservice')).adoptedCount).toBe(0);
    expect((await autoAdoptAdminOffersForTenant('t_unknown')).adoptedCount).toBe(0);
    expect(await getSupplyDomainCollections(db).tenantOfferConfigs.countDocuments({})).toBe(0);
  });

  it('dryRun counts without writing', async () => {
    await seedTenant('t1'); await seedActivation('t1'); await seedOffer('o1');

    const { adoptedCount } = await autoAdoptAdminOffersForTenant('t1', { dryRun: true });

    expect(adoptedCount).toBe(1);
    expect(await config('t1', 'o1')).toBeNull();
  });
});

describe('setAutoAdoptAdminOffers', () => {
  it('disable flips the flag and writes no rows', async () => {
    await seedTenant('t1'); await seedActivation('t1'); await seedOffer('o1');

    const { adoptedCount } = await setAutoAdoptAdminOffers('t1', false);

    expect(adoptedCount).toBe(0);
    const t = await getTenantDomainCollections(db).domainTenants.findOne({ tenantId: 't1' });
    expect(t?.autoAdoptAdminOffers).toBe(false);
    expect(await config('t1', 'o1')).toBeNull();
  });

  it('enable flips the flag and catches up', async () => {
    await seedTenant('t1', { autoAdoptAdminOffers: false }); await seedActivation('t1');
    await seedOffer('o1');

    const { adoptedCount } = await setAutoAdoptAdminOffers('t1', true);

    expect(adoptedCount).toBe(1);
    const t = await getTenantDomainCollections(db).domainTenants.findOne({ tenantId: 't1' });
    expect(t?.autoAdoptAdminOffers).toBe(true);
    expect((await config('t1', 'o1'))?.adoptionStatus).toBe('active');
  });
});
