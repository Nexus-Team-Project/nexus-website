/**
 * Tests for the IPN server-to-server verification helper: each notify type's
 * confirmed/mismatch rules against PayMe's get-sales answer, and the
 * 'unavailable' verdict when the lookup itself fails.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/payme/payme.client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/payme/payme.client')>();
  return { ...original, paymeGetSale: vi.fn() };
});

import { paymeGetSale, PaymeError } from '../../src/services/payme/payme.client';
import { verifyIpnAgainstPayme } from '../../src/services/wallet/payme-ipn-verify.helper';

const getSaleMock = vi.mocked(paymeGetSale);
const ARGS = { paymeSaleId: 'SALE-1', expectedPriceAgorot: 9000 } as const;

beforeEach(() => {
  getSaleMock.mockReset();
});

describe('verifyIpnAgainstPayme', () => {
  it('sale-complete: confirmed when PayMe shows the sale paid at the exact price', async () => {
    getSaleMock.mockResolvedValue({ saleStatus: 'completed', priceAgorot: 9000, currency: 'ILS' });
    await expect(verifyIpnAgainstPayme({ notifyType: 'sale-complete', ...ARGS })).resolves.toBe('confirmed');
  });

  it('sale-complete: mismatch on wrong price, wrong status, or unknown sale', async () => {
    getSaleMock.mockResolvedValue({ saleStatus: 'completed', priceAgorot: 1, currency: 'ILS' });
    await expect(verifyIpnAgainstPayme({ notifyType: 'sale-complete', ...ARGS })).resolves.toBe('mismatch');
    getSaleMock.mockResolvedValue({ saleStatus: 'failed', priceAgorot: 9000, currency: 'ILS' });
    await expect(verifyIpnAgainstPayme({ notifyType: 'sale-complete', ...ARGS })).resolves.toBe('mismatch');
    getSaleMock.mockResolvedValue(null);
    await expect(verifyIpnAgainstPayme({ notifyType: 'sale-complete', ...ARGS })).resolves.toBe('mismatch');
  });

  it('refund: confirmed only when PayMe shows a refunded state at the exact price', async () => {
    getSaleMock.mockResolvedValue({ saleStatus: 'refunded', priceAgorot: 9000, currency: 'ILS' });
    await expect(verifyIpnAgainstPayme({ notifyType: 'refund', ...ARGS })).resolves.toBe('confirmed');
    getSaleMock.mockResolvedValue({ saleStatus: 'completed', priceAgorot: 9000, currency: 'ILS' });
    await expect(verifyIpnAgainstPayme({ notifyType: 'refund', ...ARGS })).resolves.toBe('mismatch');
  });

  it('sale-failure: mismatch only when PayMe shows the sale actually paid', async () => {
    getSaleMock.mockResolvedValue({ saleStatus: 'completed', priceAgorot: 9000, currency: 'ILS' });
    await expect(verifyIpnAgainstPayme({ notifyType: 'sale-failure', ...ARGS })).resolves.toBe('mismatch');
    getSaleMock.mockResolvedValue({ saleStatus: 'failed', priceAgorot: 9000, currency: 'ILS' });
    await expect(verifyIpnAgainstPayme({ notifyType: 'sale-failure', ...ARGS })).resolves.toBe('confirmed');
    getSaleMock.mockResolvedValue(null);
    await expect(verifyIpnAgainstPayme({ notifyType: 'sale-failure', ...ARGS })).resolves.toBe('confirmed');
  });

  it('returns unavailable (never throws) when the lookup fails', async () => {
    getSaleMock.mockRejectedValue(new PaymeError('payme_network_error', 'down'));
    await expect(verifyIpnAgainstPayme({ notifyType: 'sale-complete', ...ARGS })).resolves.toBe('unavailable');
  });
});
