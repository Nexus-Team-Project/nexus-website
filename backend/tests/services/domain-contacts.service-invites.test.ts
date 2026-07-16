/**
 * Contact serviceInvites stamp exposure: the contacts LIST endpoint must
 * serialize the per-service outreach stamp map (dates as ISO strings) and
 * default to {} for unstamped contacts. Also guards tenantContactSchema
 * back-compat: docs without serviceInvites still parse.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/domain-member.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireTenantMemberPermission: vi.fn(async () => ({ tenantId: 't1', managerIdentityId: 'mgr1' })),
}));

import { listTenantContacts } from '../../src/services/domain-contacts.service';
import { tenantContactSchema } from '../../src/models/domain/tenant.models';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

let client: MongoClient;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`contact_svc_inv_${Date.now()}`);
});
afterAll(async () => { await db.dropDatabase(); await client.close(); });
beforeEach(async () => {
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.tenantContactFields).deleteMany({});
});

const baseContact = (over: Record<string, unknown> = {}) => ({
  tenantContactId: 'c1', tenantId: 't1', email: 'a@b.com', normalizedEmail: 'a@b.com',
  displayName: 'A', status: 'inactive', createdAt: new Date(), updatedAt: new Date(), ...over,
});

describe('tenantContactSchema serviceInvites', () => {
  it('parses a contact WITHOUT serviceInvites (back-compat)', () => {
    expect(() => tenantContactSchema.parse(baseContact())).not.toThrow();
  });
  it('parses a contact WITH a serviceInvites stamp', () => {
    const doc = baseContact({
      serviceInvites: { benefits_catalog: { lastSentAt: new Date(), channels: ['sms', 'email'] } },
    });
    expect(() => tenantContactSchema.parse(doc)).not.toThrow();
  });
});

describe('listTenantContacts serviceInvites exposure', () => {
  it('serializes the stamp map with ISO dates and defaults to {}', async () => {
    await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertMany([
      baseContact({
        tenantContactId: 'c1',
        serviceInvites: { benefits_catalog: { lastSentAt: new Date('2026-07-15T10:00:00.000Z'), channels: ['sms'] } },
      }),
      baseContact({ tenantContactId: 'c2', email: 'b@b.com', normalizedEmail: 'b@b.com' }),
    ]);
    const result = await listTenantContacts('u1', { page: 1, limit: 20, customFilters: [] });
    const byId = new Map(result.contacts.map((c) => [c.tenantContactId, c]));
    expect(byId.get('c1')!.serviceInvites).toEqual({
      benefits_catalog: { lastSentAt: '2026-07-15T10:00:00.000Z', channels: ['sms'] },
    });
    expect(byId.get('c2')!.serviceInvites).toEqual({});
  });
});
