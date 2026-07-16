/**
 * Wallet-mirror contact columns are member-owned: they are written ONLY by
 * the wallet profile sync (onboarding answers / profile update). Tenant
 * create/update APIs 400 when a payload tries to set one; the lenient CSV
 * import drops the value but keeps the row.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/domain-member.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireTenantMemberPermission: vi.fn(async () => ({ tenantId: 't1', managerIdentityId: 'mgr1' })),
}));

import {
  createTenantContact,
  updateTenantContact,
  importTenantContacts,
} from '../../src/services/domain-contacts.service';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

const CONTACTS = DOMAIN_COLLECTIONS.tenantContacts;
const FIELDS = DOMAIN_COLLECTIONS.tenantContactFields;

let client: MongoClient;
const now = new Date();

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`contacts_mirror_ro_${Date.now()}`);
});
afterAll(async () => { await db.dropDatabase(); await client.close(); });

beforeEach(async () => {
  await db.collection(CONTACTS).deleteMany({});
  await db.collection(FIELDS).deleteMany({});
  await db.collection(FIELDS).insertMany([
    // A wallet-mirror column (member-owned) and an ordinary admin column.
    { tenantContactFieldId: 'f1', tenantId: 't1', fieldId: 'cf_gender0a', name: 'Gender',
      type: 'free_text', origin: 'wallet_profile', sourceFieldKey: 'gender', order: 1, createdAt: now, updatedAt: now },
    { tenantContactFieldId: 'f2', tenantId: 't1', fieldId: 'cf_team000a', name: 'Team',
      type: 'free_text', origin: 'manual', order: 2, createdAt: now, updatedAt: now },
  ]);
});

describe('wallet-mirror columns are read-only for tenant APIs', () => {
  it('create with a mirror fieldId -> 400 Read-only wallet fields', async () => {
    await expect(
      createTenantContact('u1', {
        email: 'a@b.com', displayName: 'A',
        customFields: { cf_gender0a: 'male' },
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Read-only wallet fields') });
  });

  it('update with a mirror fieldId -> 400; admin column alone still works', async () => {
    const created = await createTenantContact('u1', {
      email: 'a@b.com', displayName: 'A', customFields: { cf_team000a: 'Ops' },
    });
    await expect(
      updateTenantContact('u1', created.tenantContactId, { customFields: { cf_gender0a: 'male' } }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const ok = await updateTenantContact('u1', created.tenantContactId, { customFields: { cf_team000a: 'HR' } });
    expect(ok.customFields.cf_team000a).toBe('HR');
  });

  it('lenient import drops the mirror value but keeps the row + admin column', async () => {
    const result = await importTenantContacts('u1', [
      { email: 'a@b.com', displayName: 'A', customFields: { cf_gender0a: 'male', cf_team000a: 'Ops' } },
    ]);
    expect(result.imported).toBe(1);
    const doc = await db.collection(CONTACTS).findOne({ tenantId: 't1' });
    expect(doc?.customFields?.cf_team000a).toBe('Ops');
    expect(doc?.customFields?.cf_gender0a).toBeUndefined();
  });
});
