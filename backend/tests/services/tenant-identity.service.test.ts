/**
 * Tests for updateTenantIdentity: writes the legacy tenants document (the
 * real source of truth) first, then refreshes the domainTenants/tenantProfiles
 * mirrors in the same call, so a later /api/me sync never reverts the edit.
 *
 * Uses the shared in-memory Mongo (TEST_MONGODB_URI); getMongoDb is mocked to
 * a per-file db since syncDomainTenantCoreDocs calls the real singleton.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { updateTenantIdentity } from '../../src/services/tenant-identity.service';
import { getOnboardingCollections } from '../../src/models/onboarding.models';
import { getTenantDomainCollections } from '../../src/models/domain/tenant.models';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_tenant_identity_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

async function seedTenant(): Promise<string> {
  const { tenants } = getOnboardingCollections(db);
  const now = new Date();
  const insert = await tenants.insertOne({
    organizationName: 'Old Name',
    website: 'https://old.example.com',
    businessDescription: 'An old description that is long enough to pass validation checks.',
    selectedUseCases: ['loyalty'],
    contactPhone: '0501234567',
    contactRole: 'owner',
    createdByUserId: 'user-1',
    status: 'active',
    businessSetupStatus: 'not_started',
    createdAt: now,
    updatedAt: now,
  });
  const tenantId = insert.insertedId.toHexString();
  const { domainTenants } = getTenantDomainCollections(db);
  await domainTenants.insertOne({
    tenantId,
    organizationName: 'Old Name',
    status: 'build_mode',
    plan: 'basic',
    createdByIdentityId: 'identity-1',
    autoAcceptJoinRequests: true,
    autoApproveOffers: false,
    autoAdoptAdminOffers: true,
    createdAt: now,
    updatedAt: now,
  });
  return tenantId;
}

beforeEach(async () => {
  const { tenants } = getOnboardingCollections(db);
  const { domainTenants, tenantProfiles } = getTenantDomainCollections(db);
  await tenants.deleteMany({});
  await domainTenants.deleteMany({});
  await tenantProfiles.deleteMany({});
});

describe('updateTenantIdentity', () => {
  it('writes the legacy tenants document and mirrors into domainTenants', async () => {
    const tenantId = await seedTenant();
    const out = await updateTenantIdentity(db, {
      tenantId,
      callerIdentityId: 'identity-1',
      organizationName: 'New Name',
      website: 'https://new.example.com',
    });
    expect(out.organizationName).toBe('New Name');
    expect(out.website).toBe('https://new.example.com');

    const { tenants } = getOnboardingCollections(db);
    const legacy = await tenants.findOne({ _id: new ObjectId(tenantId) });
    expect(legacy?.organizationName).toBe('New Name');
    expect(legacy?.website).toBe('https://new.example.com');

    const { domainTenants } = getTenantDomainCollections(db);
    const mirrored = await domainTenants.findOne({ tenantId });
    expect(mirrored?.organizationName).toBe('New Name');
    expect(mirrored?.website).toBe('https://new.example.com');
  });

  it('leaves fields not included in the update unchanged', async () => {
    const tenantId = await seedTenant();
    await updateTenantIdentity(db, {
      tenantId,
      callerIdentityId: 'identity-1',
      organizationName: 'Only Name Changed',
    });
    const { tenants } = getOnboardingCollections(db);
    const legacy = await tenants.findOne({ _id: new ObjectId(tenantId) });
    expect(legacy?.organizationName).toBe('Only Name Changed');
    expect(legacy?.website).toBe('https://old.example.com');
    expect(legacy?.contactPhone).toBe('0501234567');
  });

  it('throws a 404 for an unknown tenant', async () => {
    await expect(
      updateTenantIdentity(db, {
        tenantId: new ObjectId().toHexString(),
        callerIdentityId: 'identity-1',
        organizationName: 'X',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
