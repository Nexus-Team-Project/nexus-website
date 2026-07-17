import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import { getPublicTenantInfo } from '../../../src/services/public/public-tenant.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI as string);
  await client.connect();
  db = client.db(`public_tenant_${Date.now()}`);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await db.collection(DOMAIN_COLLECTIONS.domainTenants).deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.tenantProfiles).deleteMany({});
});

async function seedTenant(tenantId: string, opts: { catalogActive: boolean; name?: string }) {
  await db.collection(DOMAIN_COLLECTIONS.domainTenants).insertOne({
    tenantId,
    organizationName: opts.name ?? 'Acme Co',
    status: 'sandbox',
    plan: 'basic',
    createdByIdentityId: 'id_1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (opts.catalogActive) {
    await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertOne({
      tenantServiceActivationId: `act_${tenantId}`,
      tenantId,
      serviceKey: 'benefits_catalog',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

describe('getPublicTenantInfo', () => {
  it('returns name for a tenant with active benefits_catalog (ignores go-live)', async () => {
    await seedTenant('t_active', { catalogActive: true, name: 'Acme Co' });
    const r = await getPublicTenantInfo(db, 't_active');
    expect(r).toEqual({ tenantId: 't_active', organizationName: 'Acme Co', logoUrl: undefined });
  });

  it('returns null when benefits_catalog is not activated', async () => {
    await seedTenant('t_no_catalog', { catalogActive: false });
    expect(await getPublicTenantInfo(db, 't_no_catalog')).toBeNull();
  });

  it('returns null for an unknown tenant', async () => {
    expect(await getPublicTenantInfo(db, 't_missing')).toBeNull();
  });

  it('returns null when activation exists but status is suspended', async () => {
    await seedTenant('t_susp', { catalogActive: false });
    await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertOne({
      tenantServiceActivationId: 'act_susp', tenantId: 't_susp',
      serviceKey: 'benefits_catalog', status: 'suspended',
      createdAt: new Date(), updatedAt: new Date(),
    });
    expect(await getPublicTenantInfo(db, 't_susp')).toBeNull();
  });

  it('includes businessDescription from tenantProfiles when authored', async () => {
    await seedTenant('t_desc', { catalogActive: true });
    await db.collection(DOMAIN_COLLECTIONS.tenantProfiles).insertOne({
      tenantProfileId: 'tp_desc', tenantId: 't_desc',
      businessDescription: 'Leading Israeli fashion brand for the whole family.',
      selectedUseCases: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const r = await getPublicTenantInfo(db, 't_desc');
    expect(r?.businessDescription).toBe('Leading Israeli fashion brand for the whole family.');
  });

  it('omits businessDescription when the profile is missing or blank', async () => {
    await seedTenant('t_nodesc', { catalogActive: true });
    expect((await getPublicTenantInfo(db, 't_nodesc'))?.businessDescription).toBeUndefined();

    await db.collection(DOMAIN_COLLECTIONS.tenantProfiles).insertOne({
      tenantProfileId: 'tp_blank', tenantId: 't_nodesc',
      businessDescription: '   ', selectedUseCases: [],
      createdAt: new Date(), updatedAt: new Date(),
    });
    expect((await getPublicTenantInfo(db, 't_nodesc'))?.businessDescription).toBeUndefined();
  });

  it('still returns null for a described tenant without an active catalog (gate unchanged)', async () => {
    await seedTenant('t_desc_gated', { catalogActive: false });
    await db.collection(DOMAIN_COLLECTIONS.tenantProfiles).insertOne({
      tenantProfileId: 'tp_gated', tenantId: 't_desc_gated',
      businessDescription: 'Hidden until catalog active.', selectedUseCases: [],
      createdAt: new Date(), updatedAt: new Date(),
    });
    expect(await getPublicTenantInfo(db, 't_desc_gated')).toBeNull();
  });
});

describe('getPublicTenantInfo cover images', () => {
  it('exposes the ordered cover set for a catalog-active tenant', async () => {
    await seedTenant('t_covers', { catalogActive: true });
    const covers = [
      { url: 'https://res.cloudinary.com/demo/image/upload/nexus/tenant-covers/1.jpg', crop: null },
      { url: 'https://res.cloudinary.com/demo/image/upload/nexus/tenant-covers/2.jpg', crop: { x: 0, y: 0.2, width: 1, height: 0.6 } },
    ];
    await db.collection(DOMAIN_COLLECTIONS.domainTenants).updateOne(
      { tenantId: 't_covers' }, { $set: { coverImages: covers } },
    );
    const r = await getPublicTenantInfo(db, 't_covers');
    expect(r?.coverImages).toEqual(covers);
  });

  it('omits coverImages when the tenant has none', async () => {
    await seedTenant('t_nocover', { catalogActive: true });
    expect((await getPublicTenantInfo(db, 't_nocover'))?.coverImages).toBeUndefined();
  });
});
