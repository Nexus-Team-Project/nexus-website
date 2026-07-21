/**
 * Tests for the wallet purchase service: claim-inventory-then-charge with the
 * DB-enforced 1-per-variant limit. PayMe is mocked; inventory is real Mongo.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.3
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/payme/payme.client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/payme/payme.client')>();
  return {
    ...original,
    paymeChargeToken: vi.fn(),
  };
});

import { createPurchase } from '../../src/services/wallet/purchase.service';
import { listMyPurchases } from '../../src/services/wallet/purchase-read.service';
import { paymeChargeToken, PaymeError } from '../../src/services/payme/payme.client';
import {
  ensureWalletPaymentIndexes,
  WALLET_PAYMENT_CARDS_COLLECTION,
  WALLET_PURCHASES_COLLECTION,
} from '../../src/models/payments/wallet-payments.models';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

const chargeMock = vi.mocked(paymeChargeToken);

const IDENTITY = 'id_buyer';
const OFFER = 'offer1';

const PURCHASE_ARGS = {
  identityId: IDENTITY,
  email: 'buyer@example.com',
  name: 'Test Buyer',
  offerId: OFFER,
  variantId: 'v1',
  cardId: 'card1',
  tenantId: null,
  language: 'he' as const,
};

beforeAll(async () => {
  // isPaymeConfigured (real, not mocked) reads these at call time.
  process.env.PAYME_CLIENT_KEY = 'test_partner_key';
  process.env.PAYME_SELLER_ID = 'MPL1TEST-XXXXXXXX-XXXXXXXX-XXXXXXXX';
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`wallet_purchase_svc_${Date.now()}`);
  await ensureWalletPaymentIndexes(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  chargeMock.mockReset();
  for (const c of [
    DOMAIN_COLLECTIONS.nexusOffers,
    DOMAIN_COLLECTIONS.voucherCodes,
    WALLET_PAYMENT_CARDS_COLLECTION,
    WALLET_PURCHASES_COLLECTION,
  ]) {
    await db.collection(c).deleteMany({});
  }
  await db.collection(DOMAIN_COLLECTIONS.nexusOffers).insertOne({
    offerId: OFFER,
    title: 'Coffee voucher',
    executionType: 'voucher',
    status: 'active',
    visibility: 'ecosystem',
    deletedAt: null,
    createdByTenantId: 't_creator',
    variants: [
      { variantId: 'v1', face_value: 100, member_price: 90 },
      { variantId: 'v2', face_value: 200, member_price: 180 },
    ],
  });
  await db.collection(DOMAIN_COLLECTIONS.voucherCodes).insertOne({
    codeId: 'unit1', offerId: OFFER, variantId: 'v1', kind: 'barcode', value: 'BAR-111', status: 'available',
  });
  await db.collection(WALLET_PAYMENT_CARDS_COLLECTION).insertOne({
    cardId: 'card1', identityId: IDENTITY, buyerKey: 'BUYER-TOK-1',
    cardMask: '532610******5846', cardBrand: 'mastercard', expiry: '1230', createdAt: new Date(),
  });
});

function chargeOk(): void {
  chargeMock.mockResolvedValue({
    paymeSaleId: 'SALE-1', paymeSaleCode: 1, paymeTransactionId: 'TRAN-1', saleStatus: 'completed',
  });
}

describe('createPurchase - happy path', () => {
  it('claims a unit, charges the token at the resolved price, completes and returns the voucher', async () => {
    chargeOk();
    const view = await createPurchase(PURCHASE_ARGS);

    expect(view.status).toBe('completed');
    expect(view.voucher).toEqual({ kind: 'barcode', value: 'BAR-111', code: null });
    expect(view.priceAgorot).toBe(9000);

    const chargeInput = chargeMock.mock.calls[0][0];
    expect(chargeInput.buyerKey).toBe('BUYER-TOK-1');
    expect(chargeInput.priceAgorot).toBe(9000);
    expect(chargeInput.installments).toBe(1);
    expect(chargeInput.transactionId).toBe(view.purchaseId);

    const unit = await db.collection(DOMAIN_COLLECTIONS.voucherCodes).findOne({ codeId: 'unit1' });
    expect(unit!.status).toBe('assigned');
    expect(unit!.assignedPurchaseId).toBe(view.purchaseId);

    const mine = await listMyPurchases(IDENTITY);
    expect(mine).toHaveLength(1);
    expect(mine[0].voucher!.value).toBe('BAR-111');
  });
});

describe('createPurchase - 1-per-variant limit', () => {
  it('rejects a second purchase of the same variant with already_purchased', async () => {
    chargeOk();
    await createPurchase(PURCHASE_ARGS);
    await expect(createPurchase(PURCHASE_ARGS)).rejects.toThrow('already_purchased');
    // a different variant still works (given stock)
    await db.collection(DOMAIN_COLLECTIONS.voucherCodes).insertOne({
      codeId: 'unit2', offerId: OFFER, variantId: 'v2', kind: 'link', value: 'https://x/redeem', code: 'C0DE', status: 'available',
    });
    const second = await createPurchase({ ...PURCHASE_ARGS, variantId: 'v2' });
    expect(second.voucher).toEqual({ kind: 'link', value: 'https://x/redeem', code: 'C0DE' });
  });
});

describe('createPurchase - failure paths', () => {
  it('out of stock: purchase failed, no charge attempted, slot freed', async () => {
    await db.collection(DOMAIN_COLLECTIONS.voucherCodes).deleteMany({});
    await expect(createPurchase(PURCHASE_ARGS)).rejects.toThrow('out_of_stock');
    expect(chargeMock).not.toHaveBeenCalled();
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ identityId: IDENTITY });
    expect(doc!.status).toBe('failed');
    expect(doc!.active).toBeUndefined();
  });

  it('charge failure: unit released, purchase failed, retry then succeeds', async () => {
    chargeMock.mockRejectedValueOnce(new PaymeError('charge_failed', 'declined'));
    await expect(createPurchase(PURCHASE_ARGS)).rejects.toThrow('card_declined');

    const unit = await db.collection(DOMAIN_COLLECTIONS.voucherCodes).findOne({ codeId: 'unit1' });
    expect(unit!.status).toBe('available');
    expect(unit!.assignedPurchaseId).toBeUndefined();

    chargeOk();
    const retry = await createPurchase(PURCHASE_ARGS);
    expect(retry.status).toBe('completed');
  });

  it('foreign card: card_not_found, nothing claimed or inserted', async () => {
    await expect(createPurchase({ ...PURCHASE_ARGS, cardId: 'not-mine' })).rejects.toThrow('card_not_found');
    expect(await db.collection(WALLET_PURCHASES_COLLECTION).countDocuments({})).toBe(0);
    const unit = await db.collection(DOMAIN_COLLECTIONS.voucherCodes).findOne({ codeId: 'unit1' });
    expect(unit!.status).toBe('available');
  });
});
