/**
 * Voucher maxPayments: bounds on the model schema and the create/update
 * resolution helper (voucher gets default 1, non-voucher stores null).
 */
import { describe, it, expect } from 'vitest';
import {
  nexusOfferSchema,
  VOUCHER_PAYMENTS_MIN,
  VOUCHER_PAYMENTS_MAX,
  VOUCHER_PAYMENTS_DEFAULT,
} from '../../src/models/domain/supply.models';
import { resolveVoucherMaxPayments } from '../../src/services/supply-voucher.helper';

/** Minimal valid offer doc for schema-level field checks. */
const baseOffer = {
  offerId: 'o1',
  title: 'T',
  category: 'other' as const,
  createdByTenantId: 't1',
  createdByIdentityId: 'i1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('maxPayments constants', () => {
  it('are 1 / 6 / 1', () => {
    expect(VOUCHER_PAYMENTS_MIN).toBe(1);
    expect(VOUCHER_PAYMENTS_MAX).toBe(6);
    expect(VOUCHER_PAYMENTS_DEFAULT).toBe(1);
  });
});

describe('nexusOfferSchema.maxPayments', () => {
  it('accepts integers within [MIN, MAX] and null/missing', () => {
    for (const v of [VOUCHER_PAYMENTS_MIN, 3, VOUCHER_PAYMENTS_MAX, null, undefined]) {
      expect(nexusOfferSchema.safeParse({ ...baseOffer, maxPayments: v }).success).toBe(true);
    }
  });
  it('rejects out-of-range and non-integer values', () => {
    for (const v of [0, 7, 2.5, -1]) {
      expect(nexusOfferSchema.safeParse({ ...baseOffer, maxPayments: v }).success).toBe(false);
    }
  });
});

describe('resolveVoucherMaxPayments', () => {
  it('voucher with no value gets the default', () => {
    expect(resolveVoucherMaxPayments(true, undefined)).toBe(VOUCHER_PAYMENTS_DEFAULT);
  });
  it('voucher with a valid value keeps it', () => {
    expect(resolveVoucherMaxPayments(true, 5)).toBe(5);
  });
  it('clamps defensively into [MIN, MAX]', () => {
    expect(resolveVoucherMaxPayments(true, 99)).toBe(VOUCHER_PAYMENTS_MAX);
    expect(resolveVoucherMaxPayments(true, 0)).toBe(VOUCHER_PAYMENTS_MIN);
  });
  it('non-voucher always resolves null (field never carries a value)', () => {
    expect(resolveVoucherMaxPayments(false, 5)).toBeNull();
    expect(resolveVoucherMaxPayments(false, undefined)).toBeNull();
  });
});
