import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';
import {
  ensureMirrorField,
  applyMirrorTokensToTenantContact,
} from '../../../src/services/wallet/wallet-mirror-fields.helper';
import { getMirrorFieldDef } from '../../../src/config/wallet-profile-fields';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI as string);
  await client.connect();
  db = client.db(`mirror_fields_${Date.now()}`);
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await db.collection(DOMAIN_COLLECTIONS.tenantContactFields).deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).deleteMany({});
});

describe('ensureMirrorField', () => {
  it('creates a wallet_profile column once and is idempotent', async () => {
    const def = getMirrorFieldDef('gender')!;
    const id1 = await ensureMirrorField(db, 't1', def);
    const id2 = await ensureMirrorField(db, 't1', def);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^cf_[a-z0-9]{8,}$/);
    const docs = await db.collection(DOMAIN_COLLECTIONS.tenantContactFields).find({ tenantId: 't1' }).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      origin: 'wallet_profile', sourceFieldKey: 'gender', type: 'single_label',
      options: ['male', 'female', 'prefer_not_to_say'],
    });
  });
});

describe('applyMirrorTokensToTenantContact', () => {
  it('writes set tokens and unsets cleared ones on the contact', async () => {
    await db.collection(DOMAIN_COLLECTIONS.tenantContacts).insertOne({
      tenantContactId: 'c1', tenantId: 't1', email: 'a@b.com', normalizedEmail: 'a@b.com',
      displayName: 'A', nexusIdentityId: 'id1', status: 'active', createdAt: new Date(), updatedAt: new Date(),
    });
    await applyMirrorTokensToTenantContact(db, 't1', 'id1', { gender: 'female', purpose: ['save-money'] });
    let c = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantContactId: 'c1' });
    const genderField = await db.collection(DOMAIN_COLLECTIONS.tenantContactFields)
      .findOne({ tenantId: 't1', sourceFieldKey: 'gender' });
    expect(c!.customFields[genderField!.fieldId]).toBe('female');

    // Re-apply with gender cleared -> value removed.
    await applyMirrorTokensToTenantContact(db, 't1', 'id1', { purpose: ['save-money'] });
    c = await db.collection(DOMAIN_COLLECTIONS.tenantContacts).findOne({ tenantContactId: 'c1' });
    expect(c!.customFields[genderField!.fieldId]).toBeUndefined();
  });
});
