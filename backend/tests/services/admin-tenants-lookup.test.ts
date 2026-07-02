/**
 * Tests for lookupTenants (M7): the admin on-behalf-of picker source. Returns ALL
 * tenants (approved or not), name-searchable, with only the light picker fields.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { lookupTenants } from '../../src/services/admin-tenants.service';
import { getTenantDomainCollections } from '../../src/models/domain';

let client: MongoClient;

async function seed(tenantId: string, organizationName: string, approval?: unknown): Promise<void> {
  await getTenantDomainCollections(db).domainTenants.insertOne({
    tenantId, organizationName, status: 'build_mode',
    ...(approval !== undefined ? { businessSetupApproval: approval } : {}),
    createdAt: new Date(), updatedAt: new Date(),
  } as never);
}

beforeAll(async () => { client = await MongoClient.connect(process.env.TEST_MONGODB_URI!); db = client.db(`nexus_lookup_${Date.now()}`); });
afterAll(async () => { await db.dropDatabase(); await client.close(); });
beforeEach(async () => { await getTenantDomainCollections(db).domainTenants.deleteMany({}); });

describe('lookupTenants', () => {
  it('returns ALL tenants (approved or not) + total, name-searchable', async () => {
    await seed('t1', 'Acme Foods', { status: 'approved' });
    await seed('t2', 'Beta Corp'); // no approval at all
    await seed('t3', 'Acme Widgets', { status: 'pending' });
    const all = await lookupTenants({ page: 1, limit: 20 });
    expect(all.total).toBe(3);
    expect(all.tenants).toHaveLength(3);
    const acme = await lookupTenants({ page: 1, search: 'acme', limit: 20 });
    expect(acme.total).toBe(2);
    expect(acme.tenants.map((t) => t.organizationName).sort()).toEqual(['Acme Foods', 'Acme Widgets']);
  });

  it('paginates + projects only picker fields', async () => {
    for (let i = 0; i < 5; i++) await seed(`t${i}`, `Org ${i}`);
    const p1 = await lookupTenants({ page: 1, limit: 2 });
    expect(p1.total).toBe(5);
    expect(p1.tenants).toHaveLength(2);
    expect(Object.keys(p1.tenants[0]).sort()).toEqual(['organizationName', 'tenantId']);
    const p3 = await lookupTenants({ page: 3, limit: 2 });
    expect(p3.tenants).toHaveLength(1); // 5 = 2 + 2 + 1
  });
});
