/**
 * Unit tests for the PayMe provider client (payme.client.ts).
 * Global fetch is stubbed - no network. Env is driven via process.env
 * (the client reads creds at call time, mirroring inforu.client.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  paymeChargeToken,
  paymeRefundSale,
  isPaymeConfigured,
  PaymeError,
  type PaymeChargeTokenInput,
} from './payme.client';

const CHARGE_INPUT: PaymeChargeTokenInput = {
  buyerKey: 'BUYER168-XXXXXXXX-XXXXXXXX-WQIWVVLB',
  priceAgorot: 9000,
  currency: 'ILS',
  productName: 'Voucher: coffee',
  transactionId: 'purchase-1',
  callbackUrl: 'https://api.example.com/api/v1/payments/payme/callback',
  installments: 1,
  language: 'he',
  buyerName: 'Test User',
  buyerEmail: 'buyer@example.com',
};

function stubFetchOnce(json: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => json,
    text: async () => JSON.stringify(json),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.PAYME_CLIENT_KEY = 'test_partner_key';
  process.env.PAYME_CLIENT_SECRET = 'test_partner_secret';
  process.env.PAYME_SELLER_ID = 'MPL1TEST-XXXXXXXX-XXXXXXXX-XXXXXXXX';
  process.env.PAYME_BASE_URL = 'https://sandbox.payme.io/api';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PAYME_CLIENT_KEY;
  delete process.env.PAYME_CLIENT_SECRET;
  delete process.env.PAYME_SELLER_ID;
});

describe('isPaymeConfigured', () => {
  it('is true with creds set and false without', () => {
    expect(isPaymeConfigured()).toBe(true);
    delete process.env.PAYME_CLIENT_KEY;
    delete process.env.PAYME_SELLER_ID;
    expect(isPaymeConfigured()).toBe(false);
  });
});

describe('paymeChargeToken', () => {
  it('POSTs generate-sale with buyer_key + integer agorot and returns ids on success', async () => {
    const fetchMock = stubFetchOnce({
      status_code: 0,
      payme_sale_id: 'SALE1784-TEST',
      payme_sale_code: 16640041,
      payme_transaction_id: 'TRAN1784-TEST',
      sale_status: 'completed',
    });

    const res = await paymeChargeToken(CHARGE_INPUT);

    expect(res).toEqual({
      paymeSaleId: 'SALE1784-TEST',
      paymeSaleCode: 16640041,
      paymeTransactionId: 'TRAN1784-TEST',
      saleStatus: 'completed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://sandbox.payme.io/api/generate-sale');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.seller_payme_id).toBe('MPL1TEST-XXXXXXXX-XXXXXXXX-XXXXXXXX');
    expect(body.buyer_key).toBe(CHARGE_INPUT.buyerKey);
    expect(body.sale_price).toBe(9000);
    expect(body.installments).toBe('1');
    expect(body.sale_callback_url).toBe(CHARGE_INPUT.callbackUrl);
    expect(body.transaction_id).toBe('purchase-1');
    expect(body.sale_payment_method).toBe('credit-card');
    // buyer_key and capture_buyer must never coexist (PayMe API rule).
    expect(body.capture_buyer).toBeUndefined();
  });

  it('throws PaymeError(charge_failed) on status_code 1', async () => {
    stubFetchOnce({
      status_code: 1,
      status_error_code: 20028,
      status_error_details: 'card declined',
    });
    const err = await paymeChargeToken(CHARGE_INPUT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymeError);
    expect((err as PaymeError).code).toBe('charge_failed');
  });

  it('throws PaymeError(charge_failed) when sale did not complete despite status_code 0', async () => {
    stubFetchOnce({ status_code: 0, payme_sale_id: 'SALE-X', sale_status: 'failed' });
    await expect(paymeChargeToken(CHARGE_INPUT)).rejects.toMatchObject({ code: 'charge_failed' });
  });

  it('throws PaymeError(payme_bad_response) on unparseable payload', async () => {
    stubFetchOnce('not-an-object');
    await expect(paymeChargeToken(CHARGE_INPUT)).rejects.toMatchObject({ code: 'payme_bad_response' });
  });

  it('throws PaymeError(payme_not_configured) when env is missing', async () => {
    delete process.env.PAYME_CLIENT_KEY;
    delete process.env.PAYME_SELLER_ID;
    stubFetchOnce({ status_code: 0 });
    await expect(paymeChargeToken(CHARGE_INPUT)).rejects.toMatchObject({ code: 'payme_not_configured' });
  });

  it('throws PaymeError(payme_network_error) on transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(paymeChargeToken(CHARGE_INPUT)).rejects.toMatchObject({ code: 'payme_network_error' });
  });
});

describe('paymeRefundSale', () => {
  it('POSTs refund-sale with partner key and returns status', async () => {
    const fetchMock = stubFetchOnce({ status_code: 0, sale_status: 'refunded' });
    const res = await paymeRefundSale({ paymeSaleId: 'SALE1' });
    expect(res.saleStatus).toBe('refunded');
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body) as Record<string, unknown>;
    expect(body.payme_client_key).toBe('test_partner_key');
    expect(body.payme_sale_id).toBe('SALE1');
    expect(body.sale_refund_amount).toBeUndefined();
  });

  it('sends sale_refund_amount for partial refunds and fails with refund_failed on error', async () => {
    const fetchMock = stubFetchOnce({ status_code: 0, sale_status: 'partial-refund' });
    await paymeRefundSale({ paymeSaleId: 'SALE1', refundAmountAgorot: 500 });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body) as Record<string, unknown>;
    expect(body.sale_refund_amount).toBe(500);

    stubFetchOnce({ status_code: 1, status_error_details: 'nope' });
    await expect(paymeRefundSale({ paymeSaleId: 'SALE1' })).rejects.toMatchObject({ code: 'refund_failed' });
  });
});
