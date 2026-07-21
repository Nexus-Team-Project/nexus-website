/**
 * Tests for the purchase receipt service: SUMIT document per completed
 * purchase (fire-and-forget - never throws), graceful skip when SUMIT is not
 * configured, and owner-scoped PDF fetch.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.6b
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));
vi.mock('../../src/services/sumit/sumit.client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/sumit/sumit.client')>();
  return {
    ...original,
    sumitCreateReceipt: vi.fn(),
    sumitGetDocumentPdf: vi.fn(),
  };
});

import {
  issueReceiptForPurchase,
  getReceiptPdf,
} from '../../src/services/wallet/purchase-receipt.service';
import { sumitCreateReceipt, sumitGetDocumentPdf } from '../../src/services/sumit/sumit.client';
import { WALLET_PURCHASES_COLLECTION } from '../../src/models/payments/wallet-payments.models';

const createMock = vi.mocked(sumitCreateReceipt);
const pdfMock = vi.mocked(sumitGetDocumentPdf);

const PURCHASE = {
  purchaseId: 'p1',
  identityId: 'id_buyer',
  tenantId: null,
  offerId: 'o1',
  variantId: 'v1',
  priceAgorot: 9000,
  currency: 'ILS',
  installments: 1,
  cardId: 'card1',
  paymeSaleId: 'SALE-1',
  paymeTransactionId: 'TRAN-1',
  status: 'completed',
  active: true,
  voucherCodeId: 'unit1',
  receipt: null,
  createdAt: new Date(),
  paidAt: new Date(),
};

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`wallet_receipt_svc_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  createMock.mockReset();
  pdfMock.mockReset();
  process.env.SUMIT_COMPANY_ID = '522700000';
  process.env.SUMIT_API_KEY = 'test_sumit_key';
  await db.collection(WALLET_PURCHASES_COLLECTION).deleteMany({});
  await db.collection(WALLET_PURCHASES_COLLECTION).insertOne({ ...PURCHASE });
});

describe('issueReceiptForPurchase', () => {
  it('creates a SUMIT receipt (shekels, last4, external ref) and stores sent', async () => {
    createMock.mockResolvedValue({ documentId: 111222, documentNumber: 7001 });
    await issueReceiptForPurchase({
      purchaseId: 'p1',
      buyerName: 'Test Buyer',
      buyerEmail: 'buyer@example.com',
      itemName: 'Coffee voucher ₪100',
      cardMask: '532610******5846',
      language: 'he',
    });
    expect(createMock).toHaveBeenCalledWith({
      customerName: 'Test Buyer',
      customerEmail: 'buyer@example.com',
      itemName: 'Coffee voucher ₪100',
      priceShekels: 90,
      cardLast4: '5846',
      language: 'he',
      externalReference: 'p1',
    });
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.receipt).toEqual({ documentId: 111222, documentNumber: 7001, status: 'sent' });
  });

  it('skips gracefully when SUMIT is not configured', async () => {
    delete process.env.SUMIT_COMPANY_ID;
    delete process.env.SUMIT_API_KEY;
    await issueReceiptForPurchase({
      purchaseId: 'p1', buyerName: 'X', buyerEmail: 'x@y.z', itemName: 'i', cardMask: '4111********1111', language: 'en',
    });
    expect(createMock).not.toHaveBeenCalled();
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.receipt).toEqual({ documentId: null, documentNumber: null, status: 'skipped' });
  });

  it('records failed and never throws when SUMIT errors', async () => {
    createMock.mockRejectedValue(new Error('sumit_error'));
    await expect(issueReceiptForPurchase({
      purchaseId: 'p1', buyerName: 'X', buyerEmail: 'x@y.z', itemName: 'i', cardMask: '4111********1111', language: 'en',
    })).resolves.toBeUndefined();
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.receipt).toEqual({ documentId: null, documentNumber: null, status: 'failed' });
  });
});

describe('getReceiptPdf', () => {
  it('streams the PDF for the owner, rejects others with receipt_not_found', async () => {
    await db.collection(WALLET_PURCHASES_COLLECTION).updateOne(
      { purchaseId: 'p1' },
      { $set: { receipt: { documentId: 111222, documentNumber: 7001, status: 'sent' } } },
    );
    pdfMock.mockResolvedValue(Buffer.from('%PDF-fake'));
    const buf = await getReceiptPdf('id_buyer', 'p1');
    expect(buf.toString()).toContain('%PDF');
    expect(pdfMock).toHaveBeenCalledWith(111222);

    await expect(getReceiptPdf('intruder', 'p1')).rejects.toThrow('receipt_not_found');
  });

  it('rejects when no receipt document exists', async () => {
    await expect(getReceiptPdf('id_buyer', 'p1')).rejects.toThrow('receipt_not_found');
  });
});
