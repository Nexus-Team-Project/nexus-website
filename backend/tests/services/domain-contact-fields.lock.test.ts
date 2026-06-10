/**
 * Verifies the server-side read-only lock on wallet_profile mirror columns:
 * assertNotWalletField throws for mirror columns and passes for manual ones.
 * This guards renameContactField / deleteContactField against editing columns
 * owned by a member's wallet answers.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import { getTenantDomainCollections } from '../../src/models/domain';
import { assertNotWalletField } from '../../src/services/domain-contact-fields.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI as string);
  await client.connect();
  db = client.db(`contact_fields_lock_${Date.now()}`);
});
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await getTenantDomainCollections(db).tenantContactFields.deleteMany({});
});

describe('assertNotWalletField', () => {
  it('throws wallet_field_readonly for a wallet_profile column', async () => {
    const col = getTenantDomainCollections(db).tenantContactFields;
    await col.insertOne({
      fieldId: 'cf_wallet01', tenantId: 't1', name: 'Gender', type: 'single_label',
      options: ['male', 'female'], order: 0, origin: 'wallet_profile', sourceFieldKey: 'gender',
      createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(assertNotWalletField(col, 't1', 'cf_wallet01')).rejects.toThrow('wallet_field_readonly');
  });

  it('does not throw for a manual column', async () => {
    const col = getTenantDomainCollections(db).tenantContactFields;
    await col.insertOne({
      fieldId: 'cf_manual01', tenantId: 't1', name: 'Notes', type: 'free_text',
      order: 0, createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(assertNotWalletField(col, 't1', 'cf_manual01')).resolves.toBeUndefined();
  });
});
