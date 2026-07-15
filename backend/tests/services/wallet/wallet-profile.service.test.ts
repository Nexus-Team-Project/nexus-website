/**
 * Tests for patchWalletProfile - focused on the mandatory-phone gate: a
 * completion flush (`complete: true`) must be refused when the identity has no
 * phone on file, and allowed once a phone is present. Other patches (no
 * `complete`) are unaffected regardless of phone.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import { patchWalletProfile } from '../../../src/services/wallet/wallet-profile.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI as string);
  await client.connect();
  db = client.db(`profile_svc_${Date.now()}`);
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).deleteMany({});
});

const EMAIL = 'a@b.com';

async function seedIdentity(phone: string | null) {
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
    nexusIdentityId: 'id1',
    normalizedEmail: EMAIL,
    ...(phone ? { phone } : {}),
    profile: { firstName: 'A' },
  });
}

describe('patchWalletProfile mandatory-phone gate', () => {
  it('rejects complete:true when the identity has no phone', async () => {
    await seedIdentity(null);
    await expect(
      patchWalletProfile(db, { prismaUserId: 'u1', email: EMAIL, patch: { complete: true } }),
    ).rejects.toThrow('phone_required');

    // completedAt must NOT have been stamped.
    const doc = await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).findOne({ normalizedEmail: EMAIL });
    expect(doc?.profile?.completedAt).toBeUndefined();
  });

  it('allows complete:true once a phone is on file', async () => {
    await seedIdentity('0501234567');
    await patchWalletProfile(db, { prismaUserId: 'u1', email: EMAIL, patch: { complete: true } });

    const doc = await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).findOne({ normalizedEmail: EMAIL });
    expect(doc?.profile?.completedAt).toBeInstanceOf(Date);
  });

  it('allows a non-completion patch even without a phone', async () => {
    await seedIdentity(null);
    await patchWalletProfile(db, {
      prismaUserId: 'u1',
      email: EMAIL,
      patch: { firstName: 'Dana' },
    });

    const doc = await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).findOne({ normalizedEmail: EMAIL });
    expect(doc?.profile?.firstName).toBe('Dana');
    expect(doc?.profile?.completedAt).toBeUndefined();
  });
});
