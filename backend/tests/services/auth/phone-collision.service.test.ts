/**
 * Tests for phone-collision cleanup. The verified-owner identity wins;
 * stale phone fields on tenant-supplied records owned by other
 * identities are cleared.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.2
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { clearStalePhoneEntries } from '../../../src/services/auth/phone-collision.service';

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
  await db.collection('tenantContacts').deleteMany({});
  await db.collection('tenantMembersV2').deleteMany({});
});

describe('clearStalePhoneEntries', () => {
  it('clears phone from tenantContacts when owned by another identity', async () => {
    const owner = new ObjectId();
    const other = new ObjectId();
    await db.collection('tenantContacts').insertOne({
      identityId: other,
      phone: '0508465858',
    });
    await clearStalePhoneEntries(db, '0508465858', owner);
    const row = await db.collection('tenantContacts').findOne({ identityId: other });
    expect(row?.phone).toBeUndefined();
  });

  it('clears phone from tenantMembersV2 when owned by another identity', async () => {
    const owner = new ObjectId();
    const other = new ObjectId();
    await db.collection('tenantMembersV2').insertOne({
      identityId: other,
      phone: '0508465858',
    });
    await clearStalePhoneEntries(db, '0508465858', owner);
    const row = await db.collection('tenantMembersV2').findOne({ identityId: other });
    expect(row?.phone).toBeUndefined();
  });

  it('does not touch the verified-owner row', async () => {
    const owner = new ObjectId();
    await db.collection('tenantContacts').insertOne({
      identityId: owner,
      phone: '0508465858',
    });
    await clearStalePhoneEntries(db, '0508465858', owner);
    const row = await db.collection('tenantContacts').findOne({ identityId: owner });
    expect(row?.phone).toBe('0508465858');
  });

  it('does not touch rows with a different phone', async () => {
    const owner = new ObjectId();
    const other = new ObjectId();
    await db.collection('tenantContacts').insertOne({
      identityId: other,
      phone: '0501111111',
    });
    await clearStalePhoneEntries(db, '0508465858', owner);
    const row = await db.collection('tenantContacts').findOne({ identityId: other });
    expect(row?.phone).toBe('0501111111');
  });
});
