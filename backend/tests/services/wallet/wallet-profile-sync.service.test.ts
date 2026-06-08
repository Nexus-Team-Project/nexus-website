import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import { syncWalletProfileToTenants } from '../../../src/services/wallet/wallet-profile-sync.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI as string);
  await client.connect();
  db = client.db(`profile_sync_${Date.now()}`);
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  for (const c of [DOMAIN_COLLECTIONS.nexusIdentities, DOMAIN_COLLECTIONS.tenantMembers,
    DOMAIN_COLLECTIONS.tenantContacts, DOMAIN_COLLECTIONS.tenantContactFields]) {
    await db.collection(c).deleteMany({});
  }
});

async function seedMemberWithContact(tenantId: string) {
  await db.collection(DOMAIN_COLLECTIONS.tenantMembers).insertOne({
    tenantMemberId: `m_${tenantId}`, tenantId, nexusIdentityId: 'id1', status: 'active',
    email: 'a@b.com', createdAt: new Date(), updatedAt: new Date(),
  });
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertOne({
    tenantContactId: `c_${tenantId}`, tenantId, nexusIdentityId: 'id1', email: 'a@b.com',
    normalizedEmail: 'a@b.com', displayName: 'A', status: 'active', createdAt: new Date(), updatedAt: new Date(),
  });
}

describe('syncWalletProfileToTenants', () => {
  it('writes mirror columns across all active-member tenants and overwrites', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
      nexusIdentityId: 'id1', normalizedEmail: 'a@b.com',
      profile: { gender: 'female', purpose: ['save-money'] },
    });
    await seedMemberWithContact('t1');
    await seedMemberWithContact('t2');

    const r = await syncWalletProfileToTenants(db, 'id1');
    expect(r.tenantsUpdated).toBe(2);

    for (const t of ['t1', 't2']) {
      const field = await db.collection(DOMAIN_COLLECTIONS.tenantContactFields)
        .findOne({ tenantId: t, sourceFieldKey: 'gender' });
      const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantId: t });
      expect(contact!.customFields[field!.fieldId]).toBe('female');
    }
  });

  it('does not count wallet_profile columns against the manual cap (separate origin)', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
      nexusIdentityId: 'id1', normalizedEmail: 'a@b.com', profile: { gender: 'male' },
    });
    await seedMemberWithContact('t1');
    await syncWalletProfileToTenants(db, 'id1');
    const manualCount = await db.collection(DOMAIN_COLLECTIONS.tenantContactFields)
      .countDocuments({ tenantId: 't1', origin: { $ne: 'wallet_profile' } });
    expect(manualCount).toBe(0);
  });

  it('unsets a cleared answer across all member tenants on the next sync', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
      nexusIdentityId: 'id1', normalizedEmail: 'a@b.com', profile: { gender: 'female' },
    });
    await seedMemberWithContact('t1');
    await seedMemberWithContact('t2');
    await syncWalletProfileToTenants(db, 'id1');

    // User clears the gender answer; next sync must $unset it everywhere.
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities)
      .updateOne({ nexusIdentityId: 'id1' }, { $unset: { 'profile.gender': '' } });
    await syncWalletProfileToTenants(db, 'id1');

    for (const t of ['t1', 't2']) {
      const field = await db.collection(DOMAIN_COLLECTIONS.tenantContactFields)
        .findOne({ tenantId: t, sourceFieldKey: 'gender' });
      const contact = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantId: t });
      expect(contact!.customFields?.[field!.fieldId]).toBeUndefined();
    }
  });

  it('returns 0 and writes nothing when the identity has no profile', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
      nexusIdentityId: 'id1', normalizedEmail: 'a@b.com',
    });
    await seedMemberWithContact('t1');
    const r = await syncWalletProfileToTenants(db, 'id1');
    expect(r.tenantsUpdated).toBe(0);
  });
});
