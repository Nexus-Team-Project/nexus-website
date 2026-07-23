/**
 * Tests that downstream contact reads are null-safe for phone-only contacts
 * (no normalizedEmail on the document): removing a phone-only contact silently
 * deletes it instead of matching an unrelated identity or throwing.
 * Spec: docs/superpowers/specs/2026-07-15-members-service-invite-design.md s.4
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/domain-member.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireTenantMemberPermission: vi.fn(async () => ({ tenantId: 't1', managerIdentityId: 'mgr1' })),
}));

import { removeTenantContact } from '../../src/services/domain-member-actions.service';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`contacts_nullsafe_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  for (const c of [
    DOMAIN_COLLECTIONS.tenantContacts,
    DOMAIN_COLLECTIONS.nexusIdentities,
    DOMAIN_COLLECTIONS.tenantMembers,
  ]) {
    await db.collection(c).deleteMany({});
  }
});

describe('removeTenantContact with a phone-only contact', () => {
  it('silently deletes the contact and never resolves an unrelated identity', async () => {
    // An identity WITHOUT an email match must not be picked up by a
    // findOne({ normalizedEmail: undefined }) lookup.
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
      nexusIdentityId: 'idX',
      normalizedEmail: 'someone.else@example.com',
    });
    await db.collection(DOMAIN_COLLECTIONS.tenantMembers).insertOne({
      tenantMemberId: 'tmX',
      tenantId: 't1',
      nexusIdentityId: 'idX',
      status: 'active',
    });
    await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertOne({
      tenantContactId: 'c-phone-only',
      tenantId: 't1',
      phone: '0508465858',
      displayName: 'Phone Only',
      status: 'inactive',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await removeTenantContact('u1', 'c-phone-only');

    expect(
      await db.collection(DOMAIN_COLLECTIONS.tenantContacts).countDocuments({ tenantContactId: 'c-phone-only' }),
    ).toBe(0);
    // The unrelated member must be untouched.
    expect(
      await db.collection(DOMAIN_COLLECTIONS.tenantMembers).countDocuments({ tenantMemberId: 'tmX' }),
    ).toBe(1);
  });
});
