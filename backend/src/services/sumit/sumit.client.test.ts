/**
 * Unit tests for the SUMIT (OfficeGuy) provider client (sumit.client.ts).
 * Global fetch is stubbed - no network. Env driven via process.env
 * (read at call time, mirroring payme.client.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sumitCreateReceipt,
  sumitGetDocumentPdf,
  isSumitConfigured,
  SumitError,
  type SumitReceiptInput,
} from './sumit.client';

const RECEIPT_INPUT: SumitReceiptInput = {
  customerName: 'Test Buyer',
  customerEmail: 'buyer@example.com',
  itemName: 'Voucher: coffee 100',
  priceShekels: 90,
  cardLast4: '5846',
  language: 'he',
  externalReference: 'purchase-1',
};

function stubFetchOnce(json: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => json,
    arrayBuffer: async () => new TextEncoder().encode('%PDF-fake').buffer,
    headers: { get: () => 'application/pdf' },
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.SUMIT_COMPANY_ID = '522700000';
  process.env.SUMIT_API_KEY = 'test_sumit_key';
  delete process.env.SUMIT_DOCUMENT_TYPE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUMIT_COMPANY_ID;
  delete process.env.SUMIT_API_KEY;
});

describe('isSumitConfigured', () => {
  it('is true with creds set and false without', () => {
    expect(isSumitConfigured()).toBe(true);
    delete process.env.SUMIT_API_KEY;
    expect(isSumitConfigured()).toBe(false);
  });
});

describe('sumitCreateReceipt', () => {
  it('POSTs documents/create with credentials, draft flag, item, payment and email send', async () => {
    const fetchMock = stubFetchOnce({
      Status: 0,
      Data: { DocumentID: 111222, DocumentNumber: 7001, DocumentDownloadURL: 'https://x/doc.pdf' },
    });

    const res = await sumitCreateReceipt(RECEIPT_INPUT);
    expect(res).toEqual({ documentId: 111222, documentNumber: 7001 });

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://api.sumit.co.il/accounting/documents/create/');
    const body = JSON.parse(init.body) as Record<string, never> & {
      Credentials: { CompanyID: number; APIKey: string };
      Details: Record<string, unknown> & { SendByEmail: Record<string, unknown>; Customer: Record<string, unknown> };
      Items: Array<Record<string, unknown> & { Item: Record<string, unknown> }>;
      Payments: Array<Record<string, unknown> & { Details_CreditCard: Record<string, unknown> }>;
    };
    expect(body.Credentials).toEqual({ CompanyID: 522700000, APIKey: 'test_sumit_key' });
    expect(body.Details.Type).toBe(1);
    expect(body.Details.IsDraft).toBe(true); // NODE_ENV !== production in tests
    expect(body.Details.Language).toBe('Hebrew');
    expect(body.Details.ExternalReference).toBe('purchase-1');
    expect(body.Details.Customer).toMatchObject({ Name: 'Test Buyer', EmailAddress: 'buyer@example.com', SearchMode: 0 });
    expect(body.Details.SendByEmail).toMatchObject({ EmailAddress: 'buyer@example.com', Original: true });
    expect(body.Items[0]).toMatchObject({ Quantity: 1, UnitPrice: 90, TotalPrice: 90 });
    expect(body.Items[0].Item).toMatchObject({ Name: 'Voucher: coffee 100' });
    expect(body.Payments[0]).toMatchObject({ Amount: 90 });
    expect(body.Payments[0].Details_CreditCard).toMatchObject({ Last4Digits: '5846' });
    expect(body.VATIncluded).toBe(true);
  });

  it('throws SumitError(sumit_error) on non-zero Status', async () => {
    stubFetchOnce({ Status: 1, UserErrorMessage: 'bad', Data: null });
    await expect(sumitCreateReceipt(RECEIPT_INPUT)).rejects.toMatchObject({ code: 'sumit_error' });
  });

  it('throws SumitError(sumit_not_configured) when env is missing', async () => {
    delete process.env.SUMIT_API_KEY;
    stubFetchOnce({ Status: 0, Data: { DocumentID: 1 } });
    await expect(sumitCreateReceipt(RECEIPT_INPUT)).rejects.toMatchObject({ code: 'sumit_not_configured' });
  });
});

describe('sumitGetDocumentPdf', () => {
  it('POSTs documents/getpdf with DocumentID + Original and returns a Buffer', async () => {
    const fetchMock = stubFetchOnce(null);
    const buf = await sumitGetDocumentPdf(111222);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString('utf8')).toContain('%PDF');
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://api.sumit.co.il/accounting/documents/getpdf/');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.DocumentID).toBe(111222);
    expect(body.Original).toBe(false);
  });
});
