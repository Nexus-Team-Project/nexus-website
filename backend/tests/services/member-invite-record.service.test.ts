/**
 * Invite schema + record stamping tests (members-service-invite rework).
 * Invites are privileged-staff only: 'member' is rejected, the client can no
 * longer choose services, and the backend stamps ALL SERVICE_KEYS.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { inviteTenantMemberSchema } from '../../src/schemas/domain-member.schemas';
import { createMemberInviteRecord } from '../../src/services/member-invite-record.service';
import { getTenantDomainCollections, SERVICE_KEYS } from '../../src/models/domain';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_invite_record_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  const c = getTenantDomainCollections(db);
  await Promise.all([
    c.domainTenants.deleteMany({}),
    c.tenantMembers.deleteMany({}),
    c.tenantMemberInvitations.deleteMany({}),
    c.tenantContacts.deleteMany({}),
    db.collection(DOMAIN_COLLECTIONS.nexusIdentities).deleteMany({}),
    db.collection(DOMAIN_COLLECTIONS.tenantUserRoles).deleteMany({}),
    db.collection(DOMAIN_COLLECTIONS.contactProfiles).deleteMany({}),
  ]);
  const now = new Date();
  await c.domainTenants.insertOne({
    tenantId: 't1', organizationName: 'Acme', status: 'active', plan: 'basic',
    createdByIdentityId: 'creator', createdAt: now, updatedAt: now,
  } as never);
});

describe('inviteTenantMemberSchema', () => {
  const base = { email: 'a@b.com' };

  it("rejects the 'member' role", () => {
    expect(inviteTenantMemberSchema.safeParse({ ...base, roles: ['member'] }).success).toBe(false);
  });

  it('requires a non-empty roles array (no default)', () => {
    expect(inviteTenantMemberSchema.safeParse({ ...base }).success).toBe(false);
    expect(inviteTenantMemberSchema.safeParse({ ...base, roles: [] }).success).toBe(false);
  });

  it('strips a client-supplied services field', () => {
    const parsed = inviteTenantMemberSchema.parse({ ...base, roles: ['admin'], services: ['benefits_catalog'] });
    expect('services' in parsed).toBe(false);
  });
});

describe('createMemberInviteRecord', () => {
  it('stamps ALL SERVICE_KEYS on the tenantMembers and invitation docs', async () => {
    const input = inviteTenantMemberSchema.parse({ email: 'staff@acme.com', roles: ['operator'] });
    const record = await createMemberInviteRecord(
      { tenantId: 't1', managerIdentityId: 'mgr' },
      input,
    );
    expect(record.services).toEqual([...SERVICE_KEYS]);

    const c = getTenantDomainCollections(db);
    const member = await c.tenantMembers.findOne({ tenantMemberId: record.tenantMemberId });
    expect(member?.services).toEqual([...SERVICE_KEYS]);
    const invite = await c.tenantMemberInvitations.findOne({ tenantMemberInvitationId: record.invitationId });
    expect(invite?.services).toEqual([...SERVICE_KEYS]);
    expect(invite?.roles).toEqual(['operator']);
  });
});
