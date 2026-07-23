/**
 * Tests for the joined-member contact upsert: phone-only outreach rows gain
 * the email in place (no duplicate insert / unique-index violation),
 * email + phone-only duplicates merge into one row, and fresh joins insert.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { upsertJoinedTenantContact } from '../../../src/services/wallet/join-contact.helper';

let client: MongoClient;
let db: Db;

const TENANT = 'tenant_1';
const IDENTITY = 'identity_owner-0000';
const EMAIL = 'person@example.com';
const PHONE = '0508465858';

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_${Date.now()}`);
  // Mirror production's partial unique indexes so a duplicate insert FAILS the test.
  await db.collection('tenantContacts').createIndex(
    { tenantId: 1, normalizedEmail: 1 },
    { unique: true, partialFilterExpression: { normalizedEmail: { $exists: true } } },
  );
  await db.collection('tenantContacts').createIndex(
    { tenantId: 1, phone: 1 },
    { unique: true, partialFilterExpression: { phone: { $exists: true } } },
  );
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection('tenantContacts').deleteMany({});
});

const run = () =>
  upsertJoinedTenantContact(db, {
    tenantId: TENANT,
    nexusIdentityId: IDENTITY,
    email: EMAIL,
    fullName: '',
    phoneFields: { phone: PHONE, phoneVerified: true },
    now: new Date(),
  });

describe('upsertJoinedTenantContact', () => {
  it('updates a phone-only outreach contact in place (the E11000 regression)', async () => {
    await db.collection('tenantContacts').insertOne({
      tenantContactId: 'c_phone',
      tenantId: TENANT,
      phone: PHONE,
      displayName: 'By Phone',
      serviceInvites: { benefits_catalog: { channels: ['sms'] } },
    });
    await run();
    const rows = await db.collection('tenantContacts').find({ tenantId: TENANT }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantContactId).toBe('c_phone');
    expect(rows[0].normalizedEmail).toBe(EMAIL);
    expect(rows[0].phone).toBe(PHONE);
    expect(rows[0].status).toBe('active');
    expect(rows[0].nexusIdentityId).toBe(IDENTITY);
    expect(rows[0].serviceInvites).toEqual({ benefits_catalog: { channels: ['sms'] } });
    expect(rows[0].displayName).toBe('By Phone');
  });

  it('merges an email row and a phone-only row into one contact', async () => {
    await db.collection('tenantContacts').insertMany([
      {
        tenantContactId: 'c_email',
        tenantId: TENANT,
        email: EMAIL,
        normalizedEmail: EMAIL,
        customFields: { cf_aaaaaaaa: 'keep' },
      },
      {
        tenantContactId: 'c_phone',
        tenantId: TENANT,
        phone: PHONE,
        serviceInvites: { benefits_catalog: { channels: ['sms'] } },
        customFields: { cf_bbbbbbbb: 'absorb' },
      },
    ]);
    await run();
    const rows = await db.collection('tenantContacts').find({ tenantId: TENANT }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantContactId).toBe('c_email');
    expect(rows[0].phone).toBe(PHONE);
    expect(rows[0].serviceInvites).toEqual({ benefits_catalog: { channels: ['sms'] } });
    expect(rows[0].customFields).toEqual({ cf_aaaaaaaa: 'keep', cf_bbbbbbbb: 'absorb' });
  });

  it('inserts a fresh active contact when none exists', async () => {
    await run();
    const rows = await db.collection('tenantContacts').find({ tenantId: TENANT }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].normalizedEmail).toBe(EMAIL);
    expect(rows[0].phone).toBe(PHONE);
    expect(rows[0].status).toBe('active');
    expect(rows[0].displayName).toBe('person');
  });

  it('wallet full name always wins over an existing contact name', async () => {
    await db.collection('tenantContacts').insertOne({
      tenantContactId: 'c_phone',
      tenantId: TENANT,
      phone: PHONE,
      displayName: 'Old Name',
    });
    await upsertJoinedTenantContact(db, {
      tenantId: TENANT,
      nexusIdentityId: IDENTITY,
      email: EMAIL,
      fullName: 'Wallet Name',
      phoneFields: { phone: PHONE, phoneVerified: true },
      now: new Date(),
    });
    const row = await db.collection('tenantContacts').findOne({ tenantContactId: 'c_phone' });
    expect(row?.displayName).toBe('Wallet Name');
  });
});
