/**
 * Tests that account deletion covers the wallet payments collections:
 * dry-run counts include the user's saved cards + purchases, deleteMongoUser
 * removes the cards, and purchases are RETAINED as audit records (buyer
 * name/email snapshot backfilled + buyerDeletedAt stamped) while other
 * users' rows are untouched.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.2
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { collectMongoCounts, deleteMongoUser } from '../../../src/services/account-deletion/mongo';
import {
  WALLET_PAYMENT_CARDS_COLLECTION,
  WALLET_PURCHASES_COLLECTION,
} from '../../../src/models/payments/wallet-payments.models';
import { DOMAIN_COLLECTIONS } from '../../../src/models/domain/collections';

const EMAIL = 'buyer@example.com';

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`acct_del_wallet_payments_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  for (const c of [
    DOMAIN_COLLECTIONS.nexusIdentities,
    WALLET_PAYMENT_CARDS_COLLECTION,
    WALLET_PURCHASES_COLLECTION,
  ]) {
    await db.collection(c).deleteMany({});
  }
  await db.collection(DOMAIN_COLLECTIONS.nexusIdentities).insertOne({
    nexusIdentityId: 'id_buyer',
    normalizedEmail: EMAIL,
  });
  await db.collection(WALLET_PAYMENT_CARDS_COLLECTION).insertMany([
    { cardId: 'c1', identityId: 'id_buyer', buyerKey: 'BUYER-1', cardMask: '4111********1111', cardBrand: 'visa', expiry: '1230', createdAt: new Date() },
    { cardId: 'c2', identityId: 'id_other', buyerKey: 'BUYER-2', cardMask: '5555********4444', cardBrand: 'mastercard', expiry: '1230', createdAt: new Date() },
  ]);
  await db.collection(WALLET_PURCHASES_COLLECTION).insertMany([
    { purchaseId: 'p1', identityId: 'id_buyer', offerId: 'o1', variantId: 'v1', status: 'completed', active: true },
    { purchaseId: 'p2', identityId: 'id_other', offerId: 'o1', variantId: 'v1', status: 'completed', active: true },
  ]);
});

describe('account deletion covers wallet payments', () => {
  it('counts the user cards + purchases in dry run', async () => {
    const counts = await collectMongoCounts(EMAIL, null);
    expect(counts.walletPaymentCards).toBe(1);
    expect(counts.walletPurchasesRetained).toBe(1);
  });

  it('deletes the user cards but retains purchases as audit records', async () => {
    await deleteMongoUser(EMAIL, { id: 'u1', email: EMAIL, fullName: 'Buyer Person' });
    expect(await db.collection(WALLET_PAYMENT_CARDS_COLLECTION).countDocuments({})).toBe(1);
    expect(await db.collection(WALLET_PAYMENT_CARDS_COLLECTION).countDocuments({ identityId: 'id_buyer' })).toBe(0);
    // Purchases survive, with the buyer snapshot backfilled + deletion stamped.
    expect(await db.collection(WALLET_PURCHASES_COLLECTION).countDocuments({})).toBe(2);
    const retained = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(retained?.buyerName).toBe('Buyer Person');
    expect(retained?.buyerEmail).toBe(EMAIL);
    expect(retained?.buyerDeletedAt).toBeInstanceOf(Date);
  });

  it('does not overwrite an existing purchase-time buyer snapshot', async () => {
    await db.collection(WALLET_PURCHASES_COLLECTION).updateOne(
      { purchaseId: 'p1' },
      { $set: { buyerName: 'Original Name', buyerEmail: 'original@example.com' } },
    );
    await deleteMongoUser(EMAIL, { id: 'u1', email: EMAIL, fullName: 'Buyer Person' });
    const retained = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(retained?.buyerName).toBe('Original Name');
    expect(retained?.buyerEmail).toBe('original@example.com');
    expect(retained?.buyerDeletedAt).toBeInstanceOf(Date);
    // The other user's purchase is untouched.
    const other = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p2' });
    expect(other?.buyerDeletedAt).toBeUndefined();
  });
});
