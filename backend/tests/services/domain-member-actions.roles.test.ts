/**
 * Role update service-stamping tests (decision 7): upgrade to any privileged
 * role stamps ALL SERVICE_KEYS on the tenantMembers doc; downgrade to plain
 * ['member'] clears services to [].
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
// Permission resolution walks Prisma + /api/me context; stub it to a fixed tenant.
vi.mock('../../src/services/domain-member.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireTenantMemberPermission: vi.fn(async () => ({
    tenantId: 't1',
    managerIdentityId: 'mgr-identity',
  })),
}));

import { updateTenantMemberRoles } from '../../src/services/domain-member-actions.service';
import { getTenantDomainCollections, getIdentityDomainCollections, SERVICE_KEYS } from '../../src/models/domain';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_role_update_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  const t = getTenantDomainCollections(db);
  const i = getIdentityDomainCollections(db);
  await Promise.all([
    t.domainTenants.deleteMany({}), t.tenantMembers.deleteMany({}),
    t.tenantMemberInvitations.deleteMany({}), i.tenantUserRoles.deleteMany({}),
  ]);
  const now = new Date();
  await t.domainTenants.insertOne({
    tenantId: 't1', organizationName: 'Acme', status: 'active', plan: 'basic',
    createdByIdentityId: 'creator', createdAt: now, updatedAt: now,
  } as never);
  // Another active admin so the last-admin guard never trips in these tests.
  await i.tenantUserRoles.insertOne({
    tenantUserRoleId: 'r-mgr', tenantId: 't1', nexusIdentityId: 'mgr-identity',
    role: 'admin', grantedByIdentityId: 'creator', createdAt: now, updatedAt: now,
  } as never);
  await t.tenantMembers.insertOne({
    tenantMemberId: 'tm-1', tenantId: 't1', nexusIdentityId: 'id-1', status: 'active',
    requireAdminApproval: false, customFields: {}, services: [], createdAt: now, updatedAt: now,
  } as never);
});

describe('updateTenantMemberRoles service stamping', () => {
  it('upgrade to a privileged role stamps ALL SERVICE_KEYS', async () => {
    await updateTenantMemberRoles('manager-user', 'tm-1', ['operator']);
    const member = await getTenantDomainCollections(db).tenantMembers.findOne({ tenantMemberId: 'tm-1' });
    expect(member?.services).toEqual([...SERVICE_KEYS]);
  });

  it("downgrade to plain ['member'] clears services to []", async () => {
    await getTenantDomainCollections(db).tenantMembers.updateOne(
      { tenantMemberId: 'tm-1' }, { $set: { services: [...SERVICE_KEYS] } },
    );
    await updateTenantMemberRoles('manager-user', 'tm-1', ['member']);
    const member = await getTenantDomainCollections(db).tenantMembers.findOne({ tenantMemberId: 'tm-1' });
    expect(member?.services).toEqual([]);
  });
});
