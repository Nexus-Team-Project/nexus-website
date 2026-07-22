/**
 * Tests for the wallet purchase service: claim-inventory-then-charge for
 * `quantity` units. PayMe is mocked; inventory is real Mongo.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.3
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/payme/payme.client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/payme/payme.client')>();
  return { ...original, paymeChargeToken: vi.fn() };
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
  quantity: 1,
  language: 'he' as const,
};

beforeAll(async () => {
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
  await db.collection(WALLET_PAYMENT_CARDS_COLLECTION).insertOne({
    cardId: 'card1', identityId: IDENTITY, buyerKey: 'BUYER-TOK-1',
    cardMask: '532610******5846', cardBrand: 'mastercard', expiry: '1230', createdAt: new Date(),
  });
});

/** Insert n available barcode units for variant v1. */
async function seedUnits(n: number, variantId = 'v1'): Promise<void> {
  const docs = Array.from({ length: n }, (_, i) => ({
    codeId: `unit_${variantId}_${i}`, offerId: OFFER, variantId, kind: 'barcode', value: `BAR-${variantId}-${i}`, status: 'available',
  }));
  await db.collection(DOMAIN_COLLECTIONS.voucherCodes).insertMany(docs);
}

function chargeOk(): void {
  chargeMock.mockResolvedValue({ paymeSaleId: 'SALE-1', paymeSaleCode: 1, paymeTransactionId: 'TRAN-1', saleStatus: 'completed' });
}

describe('createPurchase - single unit', () => {
  it('claims a unit, charges the unit price, completes and returns one voucher', async () => {
    await seedUnits(1);
    chargeOk();
    const view = await createPurchase(PURCHASE_ARGS);

    expect(view.status).toBe('completed');
    expect(view.quantity).toBe(1);
    expect(view.vouchers).toEqual([{ kind: 'barcode', value: 'BAR-v1-0', code: null }]);
    expect(view.priceAgorot).toBe(9000);
    expect(chargeMock.mock.calls[0][0].priceAgorot).toBe(9000);

    const mine = await listMyPurchases(IDENTITY);
    expect(mine).toHaveLength(1);
    expect(mine[0].vouchers).toHaveLength(1);
  });
});

describe('createPurchase - multiple quantity', () => {
  it('claims N units and charges unit price x quantity', async () => {
    await seedUnits(3);
    chargeOk();
    const view = await createPurchase({ ...PURCHASE_ARGS, quantity: 3 });

    expect(view.quantity).toBe(3);
    expect(view.vouchers).toHaveLength(3);
    expect(chargeMock.mock.calls[0][0].priceAgorot).toBe(27000); // 9000 x 3
    const assigned = await db.collection(DOMAIN_COLLECTIONS.voucherCodes).countDocuments({ status: 'assigned' });
    expect(assigned).toBe(3);
  });

  it('allows buying the SAME variant again (no 1-per-variant limit anymore)', async () => {
    await seedUnits(2);
    chargeOk();
    await createPurchase(PURCHASE_ARGS);
    const second = await createPurchase(PURCHASE_ARGS);
    expect(second.status).toBe('completed');
  });

  it('rejects a quantity above the max', async () => {
    await seedUnits(1);
    await expect(createPurchase({ ...PURCHASE_ARGS, quantity: 99 })).rejects.toThrow('invalid_quantity');
  });
});

describe('createPurchase - failure paths', () => {
  it('not enough stock: purchase failed, no charge, all units released', async () => {
    await seedUnits(2);
    await expect(createPurchase({ ...PURCHASE_ARGS, quantity: 3 })).rejects.toThrow('out_of_stock');
    expect(chargeMock).not.toHaveBeenCalled();
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ identityId: IDENTITY });
    expect(doc!.status).toBe('failed');
    // every unit was returned to the pool
    expect(await db.collection(DOMAIN_COLLECTIONS.voucherCodes).countDocuments({ status: 'available' })).toBe(2);
  });

  it('charge failure: all units released, purchase failed, retry then succeeds', async () => {
    await seedUnits(2);
    chargeMock.mockRejectedValueOnce(new PaymeError('charge_failed', 'declined'));
    await expect(createPurchase({ ...PURCHASE_ARGS, quantity: 2 })).rejects.toThrow('card_declined');
    expect(await db.collection(DOMAIN_COLLECTIONS.voucherCodes).countDocuments({ status: 'available' })).toBe(2);

    chargeOk();
    const retry = await createPurchase({ ...PURCHASE_ARGS, quantity: 2 });
    expect(retry.status).toBe('completed');
  });

  it('foreign card: card_not_found, nothing claimed or inserted', async () => {
    await seedUnits(1);
    await expect(createPurchase({ ...PURCHASE_ARGS, cardId: 'not-mine' })).rejects.toThrow('card_not_found');
    expect(await db.collection(WALLET_PURCHASES_COLLECTION).countDocuments({})).toBe(0);
    expect(await db.collection(DOMAIN_COLLECTIONS.voucherCodes).countDocuments({ status: 'available' })).toBe(1);
  });
});
