/**
 * Unit tests for assertVoucherValidity - the voucher redemption-window
 * (amount + unit) cross-field validation used by the offers create/update
 * routes. Pure function, no DB. Covers the both-or-neither rule, the per-unit
 * ceilings (VOUCHER_VALIDITY_MAX), and the accepted cases.
 */
import { describe, it, expect } from 'vitest';
import {
  assertVoucherValidity,
  assertVoucherStackable,
  assertUniqueVariantValueStack,
  isValidHexColor,
} from '../../src/services/supply-voucher.helper';
import { VOUCHER_VALIDITY_MAX, SKU_REGEX, SKU_MIN_LENGTH, SKU_MAX_LENGTH } from '../../src/models/domain/supply.models';

/** Mirrors the model + route SKU rule: regex AND length 4-20. */
const isValidSku = (v: string): boolean =>
  SKU_REGEX.test(v) && v.length >= SKU_MIN_LENGTH && v.length <= SKU_MAX_LENGTH;

describe('assertVoucherValidity', () => {
  it('accepts both null/undefined (voucher never expires)', () => {
    expect(assertVoucherValidity(null, null)).toEqual({ ok: true });
    expect(assertVoucherValidity(undefined, undefined)).toEqual({ ok: true });
    expect(assertVoucherValidity(null, undefined)).toEqual({ ok: true });
  });

  it('accepts a valid amount + unit pair', () => {
    expect(assertVoucherValidity(2, 'years')).toEqual({ ok: true });
    expect(assertVoucherValidity(30, 'days')).toEqual({ ok: true });
    expect(assertVoucherValidity(6, 'months')).toEqual({ ok: true });
  });

  it('rejects an amount without a unit (both-or-neither)', () => {
    const r = assertVoucherValidity(2, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/both an amount and a unit/i);
      expect(r.errorHe).toBeTruthy();
    }
  });

  it('rejects a unit without an amount (both-or-neither)', () => {
    const r = assertVoucherValidity(undefined, 'years');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/both an amount and a unit/i);
  });

  it('accepts the exact per-unit ceiling', () => {
    expect(assertVoucherValidity(VOUCHER_VALIDITY_MAX.years, 'years')).toEqual({ ok: true });
    expect(assertVoucherValidity(VOUCHER_VALIDITY_MAX.months, 'months')).toEqual({ ok: true });
    expect(assertVoucherValidity(VOUCHER_VALIDITY_MAX.days, 'days')).toEqual({ ok: true });
  });

  it('rejects an amount above the per-unit ceiling', () => {
    const r = assertVoucherValidity(VOUCHER_VALIDITY_MAX.years + 1, 'years');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/must not exceed/i);

    const rDays = assertVoucherValidity(VOUCHER_VALIDITY_MAX.days + 1, 'days');
    expect(rDays.ok).toBe(false);
  });
});

describe('assertVoucherStackable', () => {
  it('accepts an explicit boolean', () => {
    expect(assertVoucherStackable(true)).toEqual({ ok: true });
    expect(assertVoucherStackable(false)).toEqual({ ok: true });
  });

  it('rejects a missing choice (null/undefined)', () => {
    const rNull = assertVoucherStackable(null);
    const rUndef = assertVoucherStackable(undefined);
    expect(rNull.ok).toBe(false);
    expect(rUndef.ok).toBe(false);
    if (!rNull.ok) {
      expect(rNull.error).toMatch(/combine-with-promotions/i);
      expect(rNull.errorHe).toBeTruthy();
    }
  });
});

describe('isValidHexColor', () => {
  it('accepts 6-digit #rrggbb (any case)', () => {
    expect(isValidHexColor('#635bff')).toBe(true);
    expect(isValidHexColor('#ABCDEF')).toBe(true);
    expect(isValidHexColor('#000000')).toBe(true);
  });

  it('rejects malformed colors', () => {
    expect(isValidHexColor('#fff')).toBe(false);        // shorthand not allowed
    expect(isValidHexColor('635bff')).toBe(false);      // missing #
    expect(isValidHexColor('#12345g')).toBe(false);     // non-hex char
    expect(isValidHexColor('#1234567')).toBe(false);    // too long
    expect(isValidHexColor(null)).toBe(false);
    expect(isValidHexColor(123)).toBe(false);
  });
});

describe('SKU rule (regex + length 4-20)', () => {
  it('accepts uppercase alnum, hyphen, underscore within length', () => {
    expect(isValidSku('GIFT')).toBe(true);
    expect(isValidSku('SUMMER-2026')).toBe(true);
    expect(isValidSku('GIFT_100')).toBe(true);
    expect(isValidSku('A1B2C3D4E5F6G7H8I9J0')).toBe(true); // exactly 20
  });

  it('rejects too short / too long', () => {
    expect(isValidSku('ABC')).toBe(false);                 // 3 chars
    expect(isValidSku('A1B2C3D4E5F6G7H8I9J0X')).toBe(false); // 21 chars
  });

  it('rejects lowercase, spaces, and special chars', () => {
    expect(isValidSku('gift-100')).toBe(false);   // lowercase
    expect(isValidSku('GIFT 100')).toBe(false);   // space
    expect(isValidSku('GIFT@100')).toBe(false);   // special char
    expect(isValidSku('GIFT.100')).toBe(false);   // dot
  });
});

describe('assertUniqueVariantValueStack (one variant per value+stackable)', () => {
  it('allows the same value twice when stackable differs (screenshot V2+V4)', () => {
    expect(assertUniqueVariantValueStack([
      { face_value: 400, voucherStackable: true },
      { face_value: 400, voucherStackable: false },
    ]).ok).toBe(true);
  });

  it('allows different values with the same stackable', () => {
    expect(assertUniqueVariantValueStack([
      { face_value: 100, voucherStackable: false },
      { face_value: 200, voucherStackable: false },
    ]).ok).toBe(true);
  });

  it('blocks the same value + same stackable even with different prices (V3+V4)', () => {
    const r = assertUniqueVariantValueStack([
      { face_value: 400, voucherStackable: false },
      { face_value: 400, voucherStackable: false },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorHe).toContain('כפל מבצעים');
  });

  it('null/undefined stackable counts as not-stackable for uniqueness', () => {
    expect(assertUniqueVariantValueStack([
      { face_value: 400, voucherStackable: null },
      { face_value: 400, voucherStackable: false },
    ]).ok).toBe(false);
    expect(assertUniqueVariantValueStack([
      { face_value: 400 },
      { face_value: 400, voucherStackable: true },
    ]).ok).toBe(true);
  });

  it('a third variant on an exhausted value is impossible (both slots taken)', () => {
    expect(assertUniqueVariantValueStack([
      { face_value: 400, voucherStackable: true },
      { face_value: 400, voucherStackable: false },
      { face_value: 400, voucherStackable: true },
    ]).ok).toBe(false);
  });

  it('empty and single-variant lists pass', () => {
    expect(assertUniqueVariantValueStack([]).ok).toBe(true);
    expect(assertUniqueVariantValueStack([{ face_value: 100, voucherStackable: true }]).ok).toBe(true);
  });
});
