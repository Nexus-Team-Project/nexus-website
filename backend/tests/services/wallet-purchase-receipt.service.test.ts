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
vi.mock('../../src/services/email/wallet-purchase-confirmation-email.service', () => ({
  sendPurchaseConfirmationMessage: vi.fn(),
}));

import {
  issueReceiptForPurchase,
  getReceiptPdf,
} from '../../src/services/wallet/purchase-receipt.service';
import { sumitCreateReceipt, sumitGetDocumentPdf } from '../../src/services/sumit/sumit.client';
import { sendPurchaseConfirmationMessage } from '../../src/services/email/wallet-purchase-confirmation-email.service';
import { WALLET_PURCHASES_COLLECTION } from '../../src/models/payments/wallet-payments.models';

const createMock = vi.mocked(sumitCreateReceipt);
const pdfMock = vi.mocked(sumitGetDocumentPdf);
const confirmationMock = vi.mocked(sendPurchaseConfirmationMessage);

/** Fields required by issueReceiptForPurchase beyond the SUMIT-specific ones. */
const CONFIRMATION_ARGS = {
  offerTitle: 'Coffee voucher',
  variantTitle: '₪100',
  totalShekels: 90,
  paidAt: new Date('2026-01-01T00:00:00.000Z'),
};

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
  quantity: 1,
  voucherCodeIds: ['unit1'],
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
  confirmationMock.mockReset();
  process.env.SUMIT_COMPANY_ID = '522700000';
  process.env.SUMIT_API_KEY = 'test_sumit_key';
  await db.collection(WALLET_PURCHASES_COLLECTION).deleteMany({});
  await db.collection(WALLET_PURCHASES_COLLECTION).insertOne({ ...PURCHASE });
});

describe('issueReceiptForPurchase', () => {
  it('creates a SUMIT receipt (shekels, last4, external ref), stores sent, and emails a confirmation with the PDF attached', async () => {
    createMock.mockResolvedValue({ documentId: 111222, documentNumber: 7001 });
    pdfMock.mockResolvedValue(Buffer.from('%PDF-fake'));
    await issueReceiptForPurchase({
      purchaseId: 'p1',
      buyerName: 'Test Buyer',
      buyerEmail: 'buyer@example.com',
      itemName: 'Coffee voucher ₪100',
      quantity: 1,
      cardMask: '532610******5846',
      language: 'he',
      ...CONFIRMATION_ARGS,
    });
    expect(createMock).toHaveBeenCalledWith({
      customerName: 'Test Buyer',
      customerEmail: 'buyer@example.com',
      itemName: 'Coffee voucher ₪100',
      priceShekels: 90,
      quantity: 1,
      cardLast4: '5846',
      language: 'he',
      externalReference: 'p1',
    });
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.receipt).toEqual({ documentId: 111222, documentNumber: 7001, status: 'sent' });
    expect(pdfMock).toHaveBeenCalledWith(111222);
    expect(confirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        buyerName: 'Test Buyer',
        offerTitle: CONFIRMATION_ARGS.offerTitle,
        variantTitle: CONFIRMATION_ARGS.variantTitle,
        totalShekels: CONFIRMATION_ARGS.totalShekels,
        cardLast4: '5846',
        lang: 'he',
        receiptPdf: Buffer.from('%PDF-fake'),
      }),
    );
  });

  it('skips the SUMIT document gracefully but STILL emails a confirmation when SUMIT is not configured', async () => {
    delete process.env.SUMIT_COMPANY_ID;
    delete process.env.SUMIT_API_KEY;
    await issueReceiptForPurchase({
      purchaseId: 'p1', buyerName: 'X', buyerEmail: 'x@y.z', itemName: 'i', quantity: 1, cardMask: '4111********1111', language: 'en',
      ...CONFIRMATION_ARGS,
    });
    expect(createMock).not.toHaveBeenCalled();
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.receipt).toEqual({ documentId: null, documentNumber: null, status: 'skipped' });
    expect(confirmationMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'x@y.z' }));
    expect(confirmationMock.mock.calls[0]?.[0]).not.toHaveProperty('receiptPdf');
  });

  it('records failed, never throws, and STILL emails a confirmation when SUMIT errors', async () => {
    createMock.mockRejectedValue(new Error('sumit_error'));
    await expect(issueReceiptForPurchase({
      purchaseId: 'p1', buyerName: 'X', buyerEmail: 'x@y.z', itemName: 'i', quantity: 1, cardMask: '4111********1111', language: 'en',
      ...CONFIRMATION_ARGS,
    })).resolves.toBeUndefined();
    const doc = await db.collection(WALLET_PURCHASES_COLLECTION).findOne({ purchaseId: 'p1' });
    expect(doc!.receipt).toEqual({ documentId: null, documentNumber: null, status: 'failed' });
    expect(confirmationMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'x@y.z' }));
    expect(confirmationMock.mock.calls[0]?.[0]).not.toHaveProperty('receiptPdf');
  });

  it('sends no email at all when the purchase is not eligible (anomaly - not the buyer\'s fault to notify)', async () => {
    await db.collection(WALLET_PURCHASES_COLLECTION).updateOne(
      { purchaseId: 'p1' },
      { $set: { status: 'refunded' } },
    );
    await issueReceiptForPurchase({
      purchaseId: 'p1', buyerName: 'X', buyerEmail: 'x@y.z', itemName: 'i', quantity: 1, cardMask: '4111********1111', language: 'en',
      ...CONFIRMATION_ARGS,
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(confirmationMock).not.toHaveBeenCalled();
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
