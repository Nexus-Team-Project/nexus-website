/**
 * Tests for phone-collision cleanup. The verified-owner identity wins;
 * stale phone fields on rows LINKED (nexusIdentityId) to other identities
 * are cleared, while unlinked tenant address-book contacts (the wallet
 * match-screen source) keep their phone.
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.2
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { clearStalePhoneEntries } from '../../../src/services/auth/phone-collision.service';

let client: MongoClient;
let db: Db;

const OWNER = 'identity_owner-0000';
const OTHER = 'identity_other-0000';

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
  it('clears phone from tenantContacts linked to another identity', async () => {
    await db.collection('tenantContacts').insertOne({
      nexusIdentityId: OTHER,
      phone: '0508465858',
    });
    await clearStalePhoneEntries(db, '0508465858', OWNER);
    const row = await db.collection('tenantContacts').findOne({ nexusIdentityId: OTHER });
    expect(row?.phone).toBeUndefined();
  });

  it('clears phone from tenantMembersV2 linked to another identity', async () => {
    await db.collection('tenantMembersV2').insertOne({
      nexusIdentityId: OTHER,
      phone: '0508465858',
    });
    await clearStalePhoneEntries(db, '0508465858', OWNER);
    const row = await db.collection('tenantMembersV2').findOne({ nexusIdentityId: OTHER });
    expect(row?.phone).toBeUndefined();
  });

  it('does not touch the verified-owner row', async () => {
    await db.collection('tenantContacts').insertOne({
      nexusIdentityId: OWNER,
      phone: '0508465858',
    });
    await clearStalePhoneEntries(db, '0508465858', OWNER);
    const row = await db.collection('tenantContacts').findOne({ nexusIdentityId: OWNER });
    expect(row?.phone).toBe('0508465858');
  });

  it('KEEPS the phone on an unlinked address-book contact (match-screen source)', async () => {
    await db.collection('tenantContacts').insertOne({
      tenantId: 'tenant_1',
      phone: '0508465858',
    });
    await clearStalePhoneEntries(db, '0508465858', OWNER);
    const row = await db.collection('tenantContacts').findOne({ tenantId: 'tenant_1' });
    expect(row?.phone).toBe('0508465858');
  });

  it('does not touch rows with a different phone', async () => {
    await db.collection('tenantContacts').insertOne({
      nexusIdentityId: OTHER,
      phone: '0501111111',
    });
    await clearStalePhoneEntries(db, '0508465858', OWNER);
    const row = await db.collection('tenantContacts').findOne({ nexusIdentityId: OTHER });
    expect(row?.phone).toBe('0501111111');
  });
});
