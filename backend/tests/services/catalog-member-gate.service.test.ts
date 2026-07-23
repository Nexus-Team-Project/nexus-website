/**
 * Member catalog gate matrix (decision 7): access = ACTIVE membership +
 * ACTIVE tenant benefits_catalog. Member services array is irrelevant.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';
import { resolveMemberCatalogAccess } from '../../src/services/catalog-member-gate.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_catalog_gate_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.tenantMembers).deleteMany({});
});

async function activateCatalog(tenantId: string, status = 'active'): Promise<void> {
  await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertOne({
    tenantServiceActivationId: `tsa_${tenantId}`, tenantId,
    serviceKey: 'benefits_catalog', status, createdAt: new Date(), updatedAt: new Date(),
  });
}

async function addMember(tenantId: string, nexusIdentityId: string, status = 'active'): Promise<void> {
  await db.collection(DOMAIN_COLLECTIONS.tenantMembers).insertOne({
    tenantMemberId: `tm_${nexusIdentityId}`, tenantId, nexusIdentityId, status,
    services: [], createdAt: new Date(), updatedAt: new Date(),
  });
}

describe('resolveMemberCatalogAccess', () => {
  it('allows a join-path member with EMPTY services when the catalog is active', async () => {
    await activateCatalog('t1');
    await addMember('t1', 'id-1');
    await expect(resolveMemberCatalogAccess(db, {
      tenantId: 't1', nexusIdentityId: 'id-1', hasCatalogViewPermission: false,
    })).resolves.toBe('allowed');
  });

  it('returns catalog_inactive when the tenant catalog is not active (even for admins)', async () => {
    await activateCatalog('t1', 'inactive');
    await addMember('t1', 'id-1');
    await expect(resolveMemberCatalogAccess(db, {
      tenantId: 't1', nexusIdentityId: 'id-1', hasCatalogViewPermission: false,
    })).resolves.toBe('catalog_inactive');
    await expect(resolveMemberCatalogAccess(db, {
      tenantId: 't1', nexusIdentityId: 'admin-1', hasCatalogViewPermission: true,
    })).resolves.toBe('catalog_inactive');
  });

  it('forbids a non-member and a suspended member', async () => {
    await activateCatalog('t1');
    await addMember('t1', 'suspended-1', 'suspended');
    await expect(resolveMemberCatalogAccess(db, {
      tenantId: 't1', nexusIdentityId: 'stranger', hasCatalogViewPermission: false,
    })).resolves.toBe('forbidden');
    await expect(resolveMemberCatalogAccess(db, {
      tenantId: 't1', nexusIdentityId: 'suspended-1', hasCatalogViewPermission: false,
    })).resolves.toBe('forbidden');
  });

  it('lets catalog.view holders bypass the membership check', async () => {
    await activateCatalog('t1');
    await expect(resolveMemberCatalogAccess(db, {
      tenantId: 't1', nexusIdentityId: 'admin-1', hasCatalogViewPermission: true,
    })).resolves.toBe('allowed');
  });
});
