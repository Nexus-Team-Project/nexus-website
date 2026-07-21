/**
 * Tests for the PayMe IPN callback reconciliation (handlePaymeCallback):
 * matching is by our purchaseId (transaction_id) + payme_sale_id + price;
 * mismatches are ignored; completion is idempotent; failure releases the
 * claimed unit; refund marks refunded but KEEPS the 1-per-variant slot.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.3
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { handlePaymeCallback } from '../../src/services/wallet/purchase.service';
import { WALLET_PURCHASES_COLLECTION } from '../../src/models/payments/wallet-payments.models';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

const BASE_PURCHASE = {
  purchaseId: 'p1',
  identityId: 'id_buyer',
  tenantId: null,
  offerId: 'o1',
  variantId: 'v1',
  quantity: 1,
  priceAgorot: 9000,
  currency: 'ILS',
  installments: 1,
  cardId: 'card1',
  paymeSaleId: 'SALE-1',
  paymeTransactionId: null,
  status: 'pending',
  voucherCodeIds: [],
  receipt: null,
  createdAt: new Date(),
  paidAt: null,
};

function callbackBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    notify_type: 'sale-complete',
    transaction_id: 'p1',
    payme_sale_id: 'SALE-1',
    payme_transaction_id: 'TRAN-1',
    price: '9000',
    sale_status: 'completed',
    ...overrides,
  };
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`wallet_purchase_cb_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(WALLET_PURCHASES_COLLECTION).deleteMany({});
  await db.collection(DOMAIN_COLLECTIONS.voucherCodes).deleteMany({});
  await db.collection(WALLET_PURCHASES_COLLECTION).insertOne({ ...BASE_PURCHASE });
  await db.collection(DOMAIN_COLLECTIONS.voucherCodes).insertOne({
    codeId: 'unit1', offerId: 'o1', variantId: 'v1', kind: 'barcode', value: 'BAR-1',
    status: 'assigned', assignedPurchaseId: 'p1',
  });
});

describe('handlePaymeCallback', () => {
  it('sale-complete: pending becomes completed with ids + claimed unit, idempotent', async () => {
    await handlePaymeCallback(callbackBody());
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.status).toBe('completed');
    expect(doc!.paymeTransactionId).toBe('TRAN-1');
    expect(doc!.voucherCodeIds).toEqual(['unit1']);
    expect(doc!.paidAt).toBeTruthy();
    // second delivery changes nothing
    await handlePaymeCallback(callbackBody());
    const again = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(again!.status).toBe('completed');
  });

  it('ignores unknown purchase ids and price mismatches', async () => {
    await handlePaymeCallback(callbackBody({ transaction_id: 'ghost' }));
    await handlePaymeCallback(callbackBody({ price: '1' }));
    await handlePaymeCallback(callbackBody({ payme_sale_id: 'SALE-WRONG' }));
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.status).toBe('pending');
  });

  it('sale-failure: pending fails, claimed unit released', async () => {
    await handlePaymeCallback(callbackBody({ notify_type: 'sale-failure', sale_status: 'failed' }));
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.status).toBe('failed');
    const unit = await db.collection(DOMAIN_COLLECTIONS.voucherCodes).findOne({ codeId: 'unit1' });
    expect(unit!.status).toBe('available');
  });

  it('refund: completed becomes refunded', async () => {
    await handlePaymeCallback(callbackBody());
    await handlePaymeCallback(callbackBody({ notify_type: 'refund', sale_status: 'refunded' }));
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.status).toBe('refunded');
  });
});
