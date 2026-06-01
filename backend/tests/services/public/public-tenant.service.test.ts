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
});
