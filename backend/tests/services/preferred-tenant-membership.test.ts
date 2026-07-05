/**
 * Tests for findPreferredTenantMembership: the dashboard context picker.
 * Privileged (non-'member') memberships win over plain member ones; ties break
 * oldest-first (the previous global behavior, preserved for single-tenant and
 * all-plain-member users).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { findPreferredTenantMembership } from '../../src/utils/preferred-tenant-membership';
import { getTenantDomainCollections, getIdentityDomainCollections } from '../../src/models/domain';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_pref_membership_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await Promise.all([
    getTenantDomainCollections(db).tenantMembers.deleteMany({}),
    getIdentityDomainCollections(db).tenantUserRoles.deleteMany({}),
  ]);
});

describe('findPreferredTenantMembership', () => {
  it('prefers a newer privileged membership over an older plain-member one', async () => {
    const old = new Date('2026-01-01');
    const recent = new Date('2026-06-01');
    await getTenantDomainCollections(db).tenantMembers.insertMany([
      { tenantMemberId: 'm1', tenantId: 't_member', nexusIdentityId: 'id1', status: 'active', createdAt: old, updatedAt: old },
      { tenantMemberId: 'm2', tenantId: 't_owner', nexusIdentityId: 'id1', status: 'active', createdAt: recent, updatedAt: recent },
    ] as never[]);
    await getIdentityDomainCollections(db).tenantUserRoles.insertMany([
      { tenantUserRoleId: 'r1', tenantId: 't_member', nexusIdentityId: 'id1', role: 'member', createdAt: old, updatedAt: old },
      { tenantUserRoleId: 'r2', tenantId: 't_owner', nexusIdentityId: 'id1', role: 'owner', createdAt: recent, updatedAt: recent },
    ] as never[]);
    const picked = await findPreferredTenantMembership(db, 'id1');
    expect(picked?.tenantId).toBe('t_owner');
  });

  it('keeps oldest-first for identities with a single membership', async () => {
    const now = new Date();
    await getTenantDomainCollections(db).tenantMembers.insertOne(
      { tenantMemberId: 'm1', tenantId: 't_only', nexusIdentityId: 'id2', status: 'active', createdAt: now, updatedAt: now } as never,
    );
    const picked = await findPreferredTenantMembership(db, 'id2');
    expect(picked?.tenantId).toBe('t_only');
  });

  it('falls back to the oldest membership when none is privileged', async () => {
    const old = new Date('2026-01-01');
    const recent = new Date('2026-06-01');
    await getTenantDomainCollections(db).tenantMembers.insertMany([
      { tenantMemberId: 'm1', tenantId: 't_a', nexusIdentityId: 'id3', status: 'active', createdAt: old, updatedAt: old },
      { tenantMemberId: 'm2', tenantId: 't_b', nexusIdentityId: 'id3', status: 'active', createdAt: recent, updatedAt: recent },
    ] as never[]);
    await getIdentityDomainCollections(db).tenantUserRoles.insertMany([
      { tenantUserRoleId: 'r1', tenantId: 't_a', nexusIdentityId: 'id3', role: 'member', createdAt: old, updatedAt: old },
      { tenantUserRoleId: 'r2', tenantId: 't_b', nexusIdentityId: 'id3', role: 'member', createdAt: recent, updatedAt: recent },
    ] as never[]);
    const picked = await findPreferredTenantMembership(db, 'id3');
    expect(picked?.tenantId).toBe('t_a');
  });

  it('prefers the OLDEST privileged membership when several are privileged', async () => {
    const old = new Date('2026-01-01');
    const recent = new Date('2026-06-01');
    await getTenantDomainCollections(db).tenantMembers.insertMany([
      { tenantMemberId: 'm1', tenantId: 't_admin_old', nexusIdentityId: 'id4', status: 'active', createdAt: old, updatedAt: old },
      { tenantMemberId: 'm2', tenantId: 't_admin_new', nexusIdentityId: 'id4', status: 'active', createdAt: recent, updatedAt: recent },
    ] as never[]);
    await getIdentityDomainCollections(db).tenantUserRoles.insertMany([
      { tenantUserRoleId: 'r1', tenantId: 't_admin_old', nexusIdentityId: 'id4', role: 'admin', createdAt: old, updatedAt: old },
      { tenantUserRoleId: 'r2', tenantId: 't_admin_new', nexusIdentityId: 'id4', role: 'admin', createdAt: recent, updatedAt: recent },
    ] as never[]);
    const picked = await findPreferredTenantMembership(db, 'id4');
    expect(picked?.tenantId).toBe('t_admin_old');
  });

  it('returns null when the identity has no active membership', async () => {
    const picked = await findPreferredTenantMembership(db, 'id_none');
    expect(picked).toBeNull();
  });
});
