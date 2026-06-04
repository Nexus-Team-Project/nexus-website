/**
 * Tests for the wallet phone-attach service — the core of phone collection.
 * Plan: docs/superpowers/plans/2026-06-04-wallet-google-phone-collection.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import {
  attachPhoneToIdentity,
  requireIsraeliPhone,
  PhoneAttachError,
} from '../../../src/services/wallet/phone-attach.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_phone_attach_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.tenantMembers).deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).deleteMany({});
});

describe('requireIsraeliPhone', () => {
  it('normalizes valid Israeli inputs and rejects non-Israeli ones', () => {
    expect(requireIsraeliPhone('050-846-5858')).toBe('0508465858');
    expect(requireIsraeliPhone('+972508465858')).toBe('0508465858');
    expect(() => requireIsraeliPhone('+15551234567')).toThrow(PhoneAttachError);
    expect(() => requireIsraeliPhone('123')).toThrow(PhoneAttachError);
  });
});

describe('attachPhoneToIdentity', () => {
  it('sets the phone on the identity and mirrors it onto existing tenant rows', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({ nexusIdentityId: 'id-1', normalizedEmail: 'a@x.com' });
    await db.collection(DOMAIN_COLLECTIONS.tenantMembers).insertOne({ nexusIdentityId: 'id-1', tenantId: 't1', status: 'active' });
    await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertOne({ nexusIdentityId: 'id-1', tenantId: 't1', normalizedEmail: 'a@x.com' });

    const { phone } = await attachPhoneToIdentity(db, { nexusIdentityId: 'id-1', phone: '050 846 5858', verified: true });
    expect(phone).toBe('0508465858');

    const identity = await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).findOne({ nexusIdentityId: 'id-1' });
    expect(identity?.phone).toBe('0508465858');
    expect(identity?.phoneVerifiedAt).toBeInstanceOf(Date);

    const member = await db.collection(DOMAIN_COLLECTIONS.tenantMembers).findOne({ nexusIdentityId: 'id-1' });
    expect(member?.phone).toBe('0508465858');
    expect(member?.phoneVerified).toBe(true);
    const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ nexusIdentityId: 'id-1' });
    expect(contact?.phone).toBe('0508465858');
    expect(contact?.phoneVerified).toBe(true);
  });

  it('test (unverified) mode: no phoneVerifiedAt, and rows marked phoneVerified=false', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({ nexusIdentityId: 'id-2', normalizedEmail: 'b@x.com' });
    await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertOne({ nexusIdentityId: 'id-2', tenantId: 't1', normalizedEmail: 'b@x.com' });
    await attachPhoneToIdentity(db, { nexusIdentityId: 'id-2', phone: '0521112222', verified: false });
    const identity = await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).findOne({ nexusIdentityId: 'id-2' });
    expect(identity?.phone).toBe('0521112222');
    expect(identity?.phoneVerifiedAt).toBeUndefined();
    const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ nexusIdentityId: 'id-2' });
    expect(contact?.phoneVerified).toBe(false);
  });

  it('blocks a phone already owned by another identity', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({ nexusIdentityId: 'owner', normalizedEmail: 'o@x.com', phone: '0508465858' });
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({ nexusIdentityId: 'id-3', normalizedEmail: 'c@x.com' });
    await expect(
      attachPhoneToIdentity(db, { nexusIdentityId: 'id-3', phone: '0508465858', verified: true }),
    ).rejects.toThrow(PhoneAttachError);
  });
});
