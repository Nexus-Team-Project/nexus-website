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
    priceAgorot: 9000,
    currency: 'ILS',
    installments: 1,
    cardId: 'card1',
    paymeSaleId: null,
    paymeTransactionId: null,
    status: 'pending',
    active: true,
    voucherCodeId: null,
    receipt: null,
    createdAt: new Date(),
    paidAt: null,
    ...overrides,
  };
}

describe('uniq_active_purchase_per_variant', () => {
  it('rejects a second ACTIVE purchase of the same variant by the same identity', async () => {
    const col = db.collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION);
    await col.insertOne(purchaseDoc({ identityId: 'dup1' }));
    await expect(col.insertOne(purchaseDoc({ identityId: 'dup1' }))).rejects.toMatchObject({ code: 11000 });
  });

  it('allows a retry after a FAILED (inactive) attempt and other variants/identities', async () => {
    const col = db.collection<WalletPurchase>(WALLET_PURCHASES_COLLECTION);
    // failed attempt: no `active` field at all
    const failed = purchaseDoc({ identityId: 'retry1', status: 'failed' });
    delete failed.active;
    await col.insertOne(failed);
    // retry with active succeeds
    await expect(col.insertOne(purchaseDoc({ identityId: 'retry1' }))).resolves.toBeTruthy();
    // different variant + different identity both fine
    await expect(col.insertOne(purchaseDoc({ identityId: 'retry1', variantId: 'var2' }))).resolves.toBeTruthy();
    await expect(col.insertOne(purchaseDoc({ identityId: 'other' }))).resolves.toBeTruthy();
  });
});
