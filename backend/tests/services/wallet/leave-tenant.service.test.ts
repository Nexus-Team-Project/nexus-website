import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import { TENANT_JOIN_REQUEST_COLLECTION } from '../../../src/models/auth/tenant-join-request.models';
import { leaveTenant } from '../../../src/services/wallet/leave-tenant.service';
import { createJoinRequests } from '../../../src/services/wallet/join-request.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI as string);
  await client.connect();
  db = client.db(`leave_tenant_${Date.now()}`);
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  for (const c of [DOMAIN_COLLECTIONS.nexusIdentities, DOMAIN_COLLECTIONS.tenantMembers,
    DOMAIN_COLLECTIONS.tenantContacts, DOMAIN_COLLECTIONS.tenantContactFields,
    DOMAIN_COLLECTIONS.tenantUserRoles, DOMAIN_COLLECTIONS.domainTenants,
    DOMAIN_COLLECTIONS.tenantServiceActivations, DOMAIN_COLLECTIONS.tenantMemberInvitations,
    TENANT_JOIN_REQUEST_COLLECTION]) {
    await db.collection(c).deleteMany({});
  }
});

/** Seed a plain member of tenant t1: identity + member role + member row + contact. */
async function seedMember(opts?: { extraRole?: string; defaultTenantId?: string }) {
  const now = new Date();
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
    nexusIdentityId: 'id1', normalizedEmail: 'a@b.com',
    ...(opts?.defaultTenantId ? { walletDefaultTenantId: opts.defaultTenantId } : {}),
  });
  await db.collection(DOMAIN_COLLECTIONS.tenantUserRoles).insertOne({
    tenantUserRoleId: 'tur1', nexusIdentityId: 'id1', tenantId: 't1', role: 'member',
    grantedByIdentityId: 'admin1', createdAt: now, updatedAt: now,
  });
  if (opts?.extraRole) {
    await db.collection(DOMAIN_COLLECTIONS.tenantUserRoles).insertOne({
      tenantUserRoleId: 'tur2', nexusIdentityId: 'id1', tenantId: 't1', role: opts.extraRole,
      grantedByIdentityId: 'admin1', createdAt: now, updatedAt: now,
    });
  }
  await db.collection(DOMAIN_COLLECTIONS.tenantMembers).insertOne({
    tenantMemberId: 'tm1', nexusIdentityId: 'id1', tenantId: 't1', status: 'active',
    services: [], email: 'a@b.com', createdAt: now, updatedAt: now,
  });
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertOne({
    tenantContactId: 'tc1', tenantId: 't1', nexusIdentityId: 'id1',
    email: 'a@b.com', normalizedEmail: 'a@b.com', displayName: 'A',
    status: 'active', createdAt: now, updatedAt: now,
  });
  await db.collection(TENANT_JOIN_REQUEST_COLLECTION).insertOne({
    nexusIdentityId: 'id1', tenantId: 't1', email: 'a@b.com',
    status: 'auto_accepted', createdAt: now, decidedAt: now,
  });
}

describe('leaveTenant', () => {
  it('deletes the member row + member role + join-request rows, keeps contact', async () => {
    await seedMember();
    await leaveTenant(db, { nexusIdentityId: 'id1', tenantId: 't1' });
    expect(await db.collection(DOMAIN_COLLECTIONS.tenantMembers)
      .findOne({ nexusIdentityId: 'id1', tenantId: 't1' })).toBeNull();
    expect(await db.collection(DOMAIN_COLLECTIONS.tenantUserRoles)
      .findOne({ nexusIdentityId: 'id1', tenantId: 't1' })).toBeNull();
    expect(await db.collection(DOMAIN_COLLECTIONS.tenantContacts)
      .findOne({ tenantId: 't1', nexusIdentityId: 'id1' })).not.toBeNull();
    // Join-request rows are deleted so the discovery sheet (which hides orgs
    // with an approved/auto_accepted request) lists the org as joinable again.
    expect(await db.collection(TENANT_JOIN_REQUEST_COLLECTION)
      .findOne({ nexusIdentityId: 'id1', tenantId: 't1' })).toBeNull();
  });

  it('leaves OTHER tenants join-request rows untouched', async () => {
    await seedMember();
    await db.collection(TENANT_JOIN_REQUEST_COLLECTION).insertOne({
      nexusIdentityId: 'id1', tenantId: 't2', email: 'a@b.com',
      status: 'pending', createdAt: new Date(),
    });
    await leaveTenant(db, { nexusIdentityId: 'id1', tenantId: 't1' });
    expect(await db.collection(TENANT_JOIN_REQUEST_COLLECTION)
      .findOne({ nexusIdentityId: 'id1', tenantId: 't2' })).not.toBeNull();
  });

  it('refuses when the caller holds a privileged role in the tenant', async () => {
    await seedMember({ extraRole: 'admin' });
    await expect(leaveTenant(db, { nexusIdentityId: 'id1', tenantId: 't1' }))
      .rejects.toThrow('privileged_role');
    // Nothing deleted.
    expect(await db.collection(DOMAIN_COLLECTIONS.tenantMembers)
      .findOne({ nexusIdentityId: 'id1', tenantId: 't1' })).not.toBeNull();
    expect(await db.collection(DOMAIN_COLLECTIONS.tenantUserRoles)
      .countDocuments({ nexusIdentityId: 'id1', tenantId: 't1' })).toBe(2);
  });

  it('throws not_a_member when there is no membership row', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
      nexusIdentityId: 'id1', normalizedEmail: 'a@b.com',
    });
    await expect(leaveTenant(db, { nexusIdentityId: 'id1', tenantId: 't1' }))
      .rejects.toThrow('not_a_member');
  });

  it('clears walletDefaultTenantId when it points at the left tenant', async () => {
    await seedMember({ defaultTenantId: 't1' });
    await leaveTenant(db, { nexusIdentityId: 'id1', tenantId: 't1' });
    const identity = await db.collection(DOMAIN_COLLECTIONS.nexusIdentities)
      .findOne({ nexusIdentityId: 'id1' });
    expect(identity!.walletDefaultTenantId).toBeUndefined();
  });

  it('keeps walletDefaultTenantId pointing at ANOTHER tenant', async () => {
    await seedMember({ defaultTenantId: 't2' });
    await leaveTenant(db, { nexusIdentityId: 'id1', tenantId: 't1' });
    const identity = await db.collection(DOMAIN_COLLECTIONS.nexusIdentities)
      .findOne({ nexusIdentityId: 'id1' });
    expect(identity!.walletDefaultTenantId).toBe('t2');
  });

  it('allows rejoining via the join-request flow after leaving', async () => {
    await seedMember();
    await leaveTenant(db, { nexusIdentityId: 'id1', tenantId: 't1' });
    // Tenant with active catalog + auto-accept ON (default) -> instant re-membership.
    await db.collection(DOMAIN_COLLECTIONS.domainTenants).insertOne({
      tenantId: 't1', organizationName: 'Acme', status: 'active', plan: 'basic',
      createdAt: new Date(), updatedAt: new Date(),
    });
    await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertOne({
      tenantServiceActivationId: 'act1', tenantId: 't1', serviceKey: 'benefits_catalog',
      status: 'active', createdAt: new Date(), updatedAt: new Date(),
    });
    const out = await createJoinRequests(db, {
      nexusIdentityId: 'id1', email: 'a@b.com', displayName: 'A', tenantIds: ['t1'],
    });
    expect(out.autoAccepted).toContain('t1');
    expect(await db.collection(DOMAIN_COLLECTIONS.tenantMembers)
      .findOne({ nexusIdentityId: 'id1', tenantId: 't1', status: 'active' })).not.toBeNull();
  });
});
