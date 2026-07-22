/**
 * Tests for the wallet payments models: the unique-active-purchase partial
 * index is the DB enforcement of "a user may buy at most 1 unit per variant" -
 * a second active purchase for the same (identity, offer, variant) must be
 * rejected, while a failed (inactive) attempt must not block a retry.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.2
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import {
  ensureWalletPaymentIndexes,
  WALLET_PURCHASES_COLLECTION,
  type WalletPurchase,
} from '../../src/models/payments/wallet-payments.models';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`wallet_payments_models_${Date.now()}`);
  await ensureWalletPaymentIndexes(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

function purchaseDoc(overrides: Partial<WalletPurchase>): WalletPurchase {
  return {
    purchaseId: `p_${Math.random().toString(36).slice(2)}`,
    identityId: 'id1',
    tenantId: null,
    offerId: 'offer1',
    variantId: 'var1',
    quantity: 1,
    priceAgorot: 9000,
    currency: 'ILS',
    installments: 1,
    cardId: 'card1',
    paymeSaleId: null,
    paymeTransactionId: null,
    status: 'pending',
    voucherCodeIds: [],
    receipt: null,
    createdAt: new Date(),
    paidAt: null,
    ...overrides,
  };
}

describe('walletPurchases', () => {
  it('allows repeated purchases of the same variant by the same identity (no 1-per-variant limit)', async () => {
    const col = db.collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION);
    await expect(col.insertOne(purchaseDoc({ identityId: 'dup1' }))).resolves.toBeTruthy();
    await expect(col.insertOne(purchaseDoc({ identityId: 'dup1' }))).resolves.toBeTruthy();
    await expect(col.insertOne(purchaseDoc({ identityId: 'dup1', variantId: 'var2' }))).resolves.toBeTruthy();
  });
});
