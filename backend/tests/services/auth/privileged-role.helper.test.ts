/**
 * Tests the privileged-role lookup used to decide whether a login needs a
 * new-device OTP: privileged = active membership + any non-'member' role.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { userHasPrivilegedTenantRole } from '../../../src/services/auth/privileged-role.helper';
import { getIdentityDomainCollections } from '../../../src/models/domain/identity.models';
import { getTenantDomainCollections } from '../../../src/models/domain/tenant.models';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  const identity = getIdentityDomainCollections(db);
  const tenants = getTenantDomainCollections(db);
  await identity.nexusIdentities.deleteMany({});
  await identity.tenantUserRoles.deleteMany({});
  await tenants.tenantMembers.deleteMany({});
});

/** Seeds an identity + membership + role in one go. */
async function seed(args: { email: string; identityId: string; tenantId: string; role: string; memberStatus: string }) {
  const identity = getIdentityDomainCollections(db);
  const tenants = getTenantDomainCollections(db);
  await identity.nexusIdentities.insertOne({
    nexusIdentityId: args.identityId,
    normalizedEmail: args.email,
  } as never);
  await tenants.tenantMembers.insertOne({
    nexusIdentityId: args.identityId,
    tenantId: args.tenantId,
    status: args.memberStatus,
    createdAt: new Date(),
  } as never);
  await identity.tenantUserRoles.insertOne({
    nexusIdentityId: args.identityId,
    tenantId: args.tenantId,
    role: args.role,
  } as never);
}

describe('userHasPrivilegedTenantRole', () => {
  it('true for an active admin', async () => {
    await seed({ email: 'a@b.com', identityId: 'id1', tenantId: 't1', role: 'admin', memberStatus: 'active' });
    expect(await userHasPrivilegedTenantRole(db, 'A@B.com')).toBe(true);
  });

  it('false for a plain member', async () => {
    await seed({ email: 'a@b.com', identityId: 'id1', tenantId: 't1', role: 'member', memberStatus: 'active' });
    expect(await userHasPrivilegedTenantRole(db, 'a@b.com')).toBe(false);
  });

  it('false when the privileged membership is not active', async () => {
    await seed({ email: 'a@b.com', identityId: 'id1', tenantId: 't1', role: 'owner', memberStatus: 'suspended' });
    expect(await userHasPrivilegedTenantRole(db, 'a@b.com')).toBe(false);
  });

  it('false when no identity exists', async () => {
    expect(await userHasPrivilegedTenantRole(db, 'ghost@b.com')).toBe(false);
  });

  it('true when member in one tenant and owner in another', async () => {
    await seed({ email: 'a@b.com', identityId: 'id1', tenantId: 't1', role: 'member', memberStatus: 'active' });
    const identity = getIdentityDomainCollections(db);
    const tenants = getTenantDomainCollections(db);
    await tenants.tenantMembers.insertOne({ nexusIdentityId: 'id1', tenantId: 't2', status: 'active', createdAt: new Date() } as never);
    await identity.tenantUserRoles.insertOne({ nexusIdentityId: 'id1', tenantId: 't2', role: 'owner' } as never);
    expect(await userHasPrivilegedTenantRole(db, 'a@b.com')).toBe(true);
  });
});
