/**
 * Tests contact create/import dedup keyed by normalizedEmail when present,
 * else phone: phone-only upserts, batch dedup, neither-identifier rows counted
 * in errors/skipped, and the partial unique index pair on tenantContacts.
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

import { createTenantContact, importTenantContacts } from '../../src/services/domain-contacts.service';
import { ensureDomainIndexes } from '../../src/models/domain/indexes';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';
import type { ImportContactRow } from '../../src/schemas/domain-contacts.schemas';

const CONTACTS = DOMAIN_COLLECTIONS.tenantContacts;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`contacts_import_${Date.now()}`);
  await ensureDomainIndexes(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(CONTACTS).deleteMany({});
});

describe('indexes', () => {
  it('allows several email-less contacts per tenant (partial email uniqueness)', async () => {
    await db.collection(CONTACTS).insertMany([
      { tenantContactId: 'c1', tenantId: 't1', phone: '0501111111', displayName: 'A', status: 'inactive', createdAt: new Date(), updatedAt: new Date() },
      { tenantContactId: 'c2', tenantId: 't1', phone: '0502222222', displayName: 'B', status: 'inactive', createdAt: new Date(), updatedAt: new Date() },
    ]);
    expect(await db.collection(CONTACTS).countDocuments({ tenantId: 't1' })).toBe(2);
  });

  it('rejects two contacts with the same phone in one tenant', async () => {
    await db.collection(CONTACTS).insertOne({
      tenantContactId: 'c1', tenantId: 't1', phone: '0501111111', displayName: 'A', status: 'inactive', createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(
      db.collection(CONTACTS).insertOne({
        tenantContactId: 'c2', tenantId: 't1', phone: '0501111111', displayName: 'B', status: 'inactive', createdAt: new Date(), updatedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('createTenantContact', () => {
  it('creates a phone-only contact with a null email in the API shape', async () => {
    const item = await createTenantContact('u1', { phone: '0508465858', displayName: 'Phone Only' });
    expect(item.email).toBeNull();
    expect(item.phone).toBe('0508465858');
    const doc = await db.collection(CONTACTS).findOne({ tenantContactId: item.tenantContactId });
    expect(doc?.normalizedEmail).toBeUndefined();
  });

  it('is idempotent per phone for phone-only contacts', async () => {
    await createTenantContact('u1', { phone: '0508465858', displayName: 'First' });
    await createTenantContact('u1', { phone: '0508465858', displayName: 'Second' });
    expect(await db.collection(CONTACTS).countDocuments({ tenantId: 't1' })).toBe(1);
  });

  it('409s when a new email contact carries a phone already owned by another contact', async () => {
    await createTenantContact('u1', { phone: '0508465858', displayName: 'Phone Owner' });
    await expect(
      createTenantContact('u1', { email: 'new@b.com', phone: '0508465858', displayName: 'Clash' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('importTenantContacts dedup email-else-phone', () => {
  it('imports email rows and phone-only rows side by side', async () => {
    const rows: ImportContactRow[] = [
      { email: 'a@b.com', displayName: 'A' },
      { phone: '0508465858', displayName: 'P' },
    ];
    const result = await importTenantContacts('u1', rows);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(await db.collection(CONTACTS).countDocuments({ tenantId: 't1' })).toBe(2);
  });

  it('dedups within the batch by phone when the row has no email', async () => {
    const rows: ImportContactRow[] = [
      { phone: '0508465858', displayName: 'P1' },
      { phone: '0508465858', displayName: 'P2' },
    ];
    const result = await importTenantContacts('u1', rows);
    expect(result.skipped).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(await db.collection(CONTACTS).countDocuments({ tenantId: 't1' })).toBe(1);
  });

  it('upserts a phone-only row onto an existing contact holding that phone', async () => {
    await createTenantContact('u1', { email: 'a@b.com', phone: '0508465858', displayName: 'Existing' });
    const result = await importTenantContacts('u1', [{ phone: '0508465858', displayName: 'Updated' }]);
    expect(result.imported).toBe(1);
    expect(await db.collection(CONTACTS).countDocuments({ tenantId: 't1' })).toBe(1);
    const doc = await db.collection(CONTACTS).findOne({ tenantId: 't1' });
    expect(doc?.displayName).toBe('Updated');
    expect(doc?.normalizedEmail).toBe('a@b.com');
  });

  it('counts rows with neither identifier in errors and skipped', async () => {
    const rows: ImportContactRow[] = [
      { email: 'a@b.com', displayName: 'A' },
      { displayName: 'Nobody' },
    ];
    const result = await importTenantContacts('u1', rows);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors.some((e) => e.includes('missing both'))).toBe(true);
  });
});
