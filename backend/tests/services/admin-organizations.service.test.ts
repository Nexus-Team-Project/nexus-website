/**
 * Behavioral tests for admin org management (admin-organizations.service) and
 * its supporting seat-count change:
 *   - seat counting: the 'owner' role never consumes a billable seat.
 *   - createAdminOrganization: creates legacy + domain tenant docs WITHOUT any
 *     membership/role rows for the creating platform admin.
 *   - listAdminOrganizations: admin-created tenants only, newest first,
 *     search + pagination, owner-state derivation.
 *   - assignOrganizationOwner: immediate identity + membership + owner role +
 *     assignment + notification email; blocks platform admins and emails that
 *     are owner/admin of any tenant; plain members elsewhere are allowed.
 *   - removeOrganizationOwner: typo window - allowed while activatedAt is null,
 *     409 owner_already_active afterwards.
 *
 * Uses the shared in-memory Mongo (TEST_MONGODB_URI); getMongoDb is mocked to a
 * per-file db. Email service is mocked; isPlatformAdminEmail is mocked so the
 * platform-admin block is testable without touching the env cache.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
// No real mail; assert the call instead.
vi.mock('../../src/services/org-owner-email.service', () => ({
  sendOrgOwnerAssignedEmail: vi.fn(async () => {}),
}));
// Deterministic platform-admin check (the real one caches NEXUS_ADMIN_EMAILS
// for the process lifetime).
vi.mock('../../src/utils/platform-admin', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isPlatformAdminEmail: (email: string) => email === 'other-admin@nexus.com',
}));

import {
  createAdminOrganization,
  listAdminOrganizations,
  assignOrganizationOwner,
  removeOrganizationOwner,
} from '../../src/services/admin-organizations.service';
import { sendOrgOwnerAssignedEmail } from '../../src/services/org-owner-email.service';
import { getTenantPlanSummary } from '../../src/services/domain-tenant-plan.service';
import { getTenantDomainCollections, getIdentityDomainCollections } from '../../src/models/domain';
import { getOnboardingCollections } from '../../src/models/onboarding.models';
import type { WorkspaceSetupInput } from '../../src/schemas/onboarding.schemas';

let client: MongoClient;

/** A valid wizard payload (values from USE_CASES / CONTACT_ROLES). */
const WIZARD_INPUT: WorkspaceSetupInput = {
  organizationName: 'Acme Ltd',
  website: 'https://acme.example.com',
  businessDescription: 'A test organization for admin-created tenant coverage.',
  selectedUseCases: ['benefits_club'],
  contactPhone: '+972501234567',
  contactRole: 'ceo',
};

/** Creates one admin-created org and returns its tenantId. */
async function makeOrg(name = 'Acme Ltd'): Promise<string> {
  const row = await createAdminOrganization({
    adminUserId: 'prisma_admin_1',
    adminIdentityId: 'identity_admin',
    adminEmail: 'a@nexus.com',
    data: { ...WIZARD_INPUT, organizationName: name },
  });
  return row.tenantId;
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_admin_orgs_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const tenants = getTenantDomainCollections(db);
  const identities = getIdentityDomainCollections(db);
  const onboarding = getOnboardingCollections(db);
  await Promise.all([
    tenants.domainTenants.deleteMany({}),
    tenants.tenantMembers.deleteMany({}),
    tenants.tenantOnboardingStates.deleteMany({}),
    tenants.tenantProfiles.deleteMany({}),
    identities.tenantUserRoles.deleteMany({}),
    identities.nexusIdentities.deleteMany({}),
    identities.contactProfiles.deleteMany({}),
    db.collection('tenantMemberInvitations').deleteMany({}),
    onboarding.tenants.deleteMany({}),
  ]);
});

describe('seat counting excludes the owner role', () => {
  it('an assigned owner (not the creator identity) does not consume a seat', async () => {
    const tenants = getTenantDomainCollections(db);
    const identities = getIdentityDomainCollections(db);
    const now = new Date();
    // Admin-created tenant: creator identity is the platform admin.
    await tenants.domainTenants.insertOne({
      tenantId: 't1', organizationName: 'Org', status: 'build_mode',
      createdByIdentityId: 'identity_admin', plan: 'basic',
      createdAt: now, updatedAt: now,
    } as never);
    // Assigned owner holds the 'owner' role but is NOT createdByIdentityId.
    await identities.tenantUserRoles.insertOne({
      tenantUserRoleId: 'r1', tenantId: 't1',
      nexusIdentityId: 'identity_owner', role: 'owner',
      createdAt: now, updatedAt: now,
    } as never);
    // One real seat: a directly added admin (no invitation record).
    await identities.tenantUserRoles.insertOne({
      tenantUserRoleId: 'r2', tenantId: 't1',
      nexusIdentityId: 'identity_staff', role: 'admin',
      createdAt: now, updatedAt: now,
    } as never);

    const summary = await getTenantPlanSummary('t1');
    expect(summary.seatsUsed).toBe(1); // owner excluded, staff admin counted
  });
});

describe('createAdminOrganization', () => {
  it('creates tenant docs WITHOUT any membership or role rows', async () => {
    const row = await createAdminOrganization({
      adminUserId: 'prisma_admin_1',
      adminIdentityId: 'identity_admin',
      adminEmail: 'admin@nexus.com',
      data: WIZARD_INPUT,
      brandColor: '#635bff',
    });
    expect(row.ownerState).toBe('none');
    expect(row.organizationName).toBe('Acme Ltd');

    const tenants = getTenantDomainCollections(db);
    const domainTenant = await tenants.domainTenants.findOne({ tenantId: row.tenantId });
    expect(domainTenant?.adminCreated?.createdByAdminEmail).toBe('admin@nexus.com');
    expect(domainTenant?.createdByIdentityId).toBe('identity_admin');
    expect(domainTenant?.brandColor).toBe('#635bff');
    // The critical assertion: the admin did NOT join the tenant.
    expect(await tenants.tenantMembers.countDocuments({ tenantId: row.tenantId })).toBe(0);
    expect(await getIdentityDomainCollections(db).tenantUserRoles
      .countDocuments({ tenantId: row.tenantId })).toBe(0);
    // Profile + onboarding-state docs exist (normal lifecycle).
    expect(await tenants.tenantProfiles.countDocuments({ tenantId: row.tenantId })).toBe(1);
    expect(await tenants.tenantOnboardingStates.countDocuments({ tenantId: row.tenantId })).toBe(1);
    // Legacy tenant doc exists with the admin stamped as creator.
    const legacy = await getOnboardingCollections(db).tenants.findOne({});
    expect(legacy?.createdByUserId).toBe('prisma_admin_1');
    expect(legacy?.businessSetupStatus).toBe('not_started');
  });
});

describe('listAdminOrganizations', () => {
  it('returns only admin-created tenants, newest first, with search + pagination', async () => {
    await makeOrg('Alpha Org');
    // Ensure a strictly later createdAt for deterministic ordering.
    await new Promise((r) => setTimeout(r, 5));
    await makeOrg('Beta Org');
    // An organic tenant must not appear.
    await getTenantDomainCollections(db).domainTenants.insertOne({
      tenantId: 't_organic', organizationName: 'Organic', status: 'build_mode',
      createdByIdentityId: 'x', createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const all = await listAdminOrganizations({ page: 1, limit: 20 });
    expect(all.total).toBe(2);
    expect(all.items.map((i) => i.organizationName)).toEqual(['Beta Org', 'Alpha Org']);

    const filtered = await listAdminOrganizations({ page: 1, limit: 20, search: 'alpha' });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.ownerState).toBe('none');

    const paged = await listAdminOrganizations({ page: 2, limit: 1 });
    expect(paged.items).toHaveLength(1);
    expect(paged.items[0]?.organizationName).toBe('Alpha Org');
  });
});

describe('assignOrganizationOwner', () => {
  it('creates identity + active membership + owner role + assignment, and emails', async () => {
    const tenantId = await makeOrg();
    const row = await assignOrganizationOwner(tenantId, 'new-owner@example.com', 'he', 'a@nexus.com');
    expect(row.ownerState).toBe('assigned');
    expect(row.ownerEmail).toBe('new-owner@example.com');

    const member = await getTenantDomainCollections(db).tenantMembers.findOne({ tenantId });
    expect(member?.status).toBe('active');
    const role = await getIdentityDomainCollections(db).tenantUserRoles.findOne({ tenantId });
    expect(role?.role).toBe('owner');
    const identity = await getIdentityDomainCollections(db).nexusIdentities
      .findOne({ normalizedEmail: 'new-owner@example.com' });
    expect(identity?.nexusIdentityId).toBe(member?.nexusIdentityId);

    expect(sendOrgOwnerAssignedEmail).toHaveBeenCalledWith('new-owner@example.com', 'Acme Ltd', 'he');
  });

  it('rejects a platform-admin email with code owner_is_platform_admin', async () => {
    const tenantId = await makeOrg();
    await expect(assignOrganizationOwner(tenantId, 'other-admin@nexus.com', 'en', 'a@nexus.com'))
      .rejects.toMatchObject({ statusCode: 409, code: 'owner_is_platform_admin' });
  });

  it('rejects an owner/admin of another tenant; plain member elsewhere is allowed', async () => {
    const identities = getIdentityDomainCollections(db);
    const now = new Date();
    // busy@example.com is an admin elsewhere.
    await identities.nexusIdentities.insertOne({
      nexusIdentityId: 'id_busy', normalizedEmail: 'busy@example.com',
      authProvider: 'email_passwordless', status: 'active', locale: 'he',
      createdAt: now, updatedAt: now,
    } as never);
    await identities.tenantUserRoles.insertOne({
      tenantUserRoleId: 'r_busy', tenantId: 't_other', nexusIdentityId: 'id_busy',
      role: 'admin', createdAt: now, updatedAt: now,
    } as never);
    // memberonly@example.com is just a member elsewhere.
    await identities.nexusIdentities.insertOne({
      nexusIdentityId: 'id_mem', normalizedEmail: 'memberonly@example.com',
      authProvider: 'email_passwordless', status: 'active', locale: 'he',
      createdAt: now, updatedAt: now,
    } as never);
    await identities.tenantUserRoles.insertOne({
      tenantUserRoleId: 'r_mem', tenantId: 't_other', nexusIdentityId: 'id_mem',
      role: 'member', createdAt: now, updatedAt: now,
    } as never);

    const t1 = await makeOrg();
    await expect(assignOrganizationOwner(t1, 'busy@example.com', 'en', 'a@nexus.com'))
      .rejects.toMatchObject({ statusCode: 409, code: 'owner_has_privileged_role' });
    const row = await assignOrganizationOwner(t1, 'memberonly@example.com', 'en', 'a@nexus.com');
    expect(row.ownerState).toBe('assigned');
  });

  it('rejects double-assign and assigning the same email to a second org', async () => {
    const t1 = await makeOrg('Org One');
    const t2 = await makeOrg('Org Two');
    await assignOrganizationOwner(t1, 'solo@example.com', 'en', 'a@nexus.com');
    await expect(assignOrganizationOwner(t1, 'second@example.com', 'en', 'a@nexus.com'))
      .rejects.toMatchObject({ statusCode: 409, code: 'owner_already_assigned' });
    // solo@ now holds 'owner' in t1, so the privileged-role block fires for t2.
    await expect(assignOrganizationOwner(t2, 'solo@example.com', 'en', 'a@nexus.com'))
      .rejects.toMatchObject({ statusCode: 409, code: 'owner_has_privileged_role' });
  });

  it('404s for an unknown or non-admin-created tenant', async () => {
    await getTenantDomainCollections(db).domainTenants.insertOne({
      tenantId: 't_org2', organizationName: 'Organic', status: 'build_mode',
      createdByIdentityId: 'x', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    await expect(assignOrganizationOwner('t_missing', 'x@example.com', 'en', 'a@nexus.com'))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(assignOrganizationOwner('t_org2', 'x@example.com', 'en', 'a@nexus.com'))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('removeOrganizationOwner', () => {
  it('removes membership + role + assignment while not activated', async () => {
    const tenantId = await makeOrg();
    await assignOrganizationOwner(tenantId, 'typo@example.com', 'en', 'a@nexus.com');
    const row = await removeOrganizationOwner(tenantId);
    expect(row.ownerState).toBe('none');
    expect(await getTenantDomainCollections(db).tenantMembers.countDocuments({ tenantId })).toBe(0);
    expect(await getIdentityDomainCollections(db).tenantUserRoles.countDocuments({ tenantId })).toBe(0);
  });

  it('409s with owner_already_active after activation', async () => {
    const tenantId = await makeOrg();
    await assignOrganizationOwner(tenantId, 'active@example.com', 'en', 'a@nexus.com');
    await getTenantDomainCollections(db).domainTenants.updateOne(
      { tenantId },
      { $set: { 'ownerAssignment.activatedAt': new Date() } },
    );
    await expect(removeOrganizationOwner(tenantId))
      .rejects.toMatchObject({ statusCode: 409, code: 'owner_already_active' });
  });
});
