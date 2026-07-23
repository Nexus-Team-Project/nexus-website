/**
 * Derived search fields: variant/base cashback math (mirrors the wallet's
 * computeOfferCashback formula) and the write-fields spread helper.
 */
import { describe, it, expect } from 'vitest';
import {
  variantCashbackPct,
  baseCashbackFields,
  offerSearchWriteFields,
} from '../../src/services/offer-search-fields.helper';

describe('variantCashbackPct', () => {
  it('is round((face - price) / face * 100)', () => {
    expect(variantCashbackPct(100, 80)).toBe(20);
    expect(variantCashbackPct(500, 230)).toBe(54);
    expect(variantCashbackPct(150, 100)).toBe(33); // 33.33 rounds down
  });

  it('is undefined when there is no saving or inputs are missing', () => {
    expect(variantCashbackPct(100, 100)).toBeUndefined();
    expect(variantCashbackPct(100, 120)).toBeUndefined();
    expect(variantCashbackPct(undefined, 80)).toBeUndefined();
    expect(variantCashbackPct(100, undefined)).toBeUndefined();
    expect(variantCashbackPct(0, 0)).toBeUndefined();
    expect(variantCashbackPct(100, 0)).toBeUndefined();
  });
});

describe('baseCashbackFields', () => {
  it('aggregates min/max across variants', () => {
    expect(baseCashbackFields([
      { face_value: 100, member_price: 90 },  // 10%
      { face_value: 500, member_price: 230 }, // 54%
      { face_value: 200, member_price: 150 }, // 25%
    ])).toEqual({ cashbackMinPct: 10, cashbackMaxPct: 54 });
  });

  it('skips variants without cashback but keeps the rest', () => {
    expect(baseCashbackFields([
      { face_value: 100, member_price: 100 }, // none
      { face_value: 100, member_price: 75 },  // 25%
    ])).toEqual({ cashbackMinPct: 25, cashbackMaxPct: 25 });
  });

  it('falls back to the flat fields when no variants exist', () => {
    expect(baseCashbackFields(undefined, 100, 60)).toEqual({ cashbackMinPct: 40, cashbackMaxPct: 40 });
    expect(baseCashbackFields([], 100, 60)).toEqual({ cashbackMinPct: 40, cashbackMaxPct: 40 });
  });

  it('is null/null when nothing yields cashback (non-vouchers, unpriced)', () => {
    expect(baseCashbackFields(undefined, undefined, undefined)).toEqual({ cashbackMinPct: null, cashbackMaxPct: null });
    expect(baseCashbackFields([{ face_value: 50, member_price: 50 }])).toEqual({ cashbackMinPct: null, cashbackMaxPct: null });
  });
});

describe('offerSearchWriteFields', () => {
  it('stamps descriptionText only when a description is provided', () => {
    const withDesc = offerSearchWriteFields({ description: '<p>Hi <b>there</b></p>' });
    expect(withDesc.descriptionText).toBe('Hi there');
    const without = offerSearchWriteFields({});
    expect('descriptionText' in without).toBe(false);
  });

  it('always includes the cashback range', () => {
    expect(offerSearchWriteFields({ variants: [{ face_value: 100, member_price: 80 }] }))
      .toMatchObject({ cashbackMinPct: 20, cashbackMaxPct: 20 });
    expect(offerSearchWriteFields({})).toMatchObject({ cashbackMinPct: null, cashbackMaxPct: null });
  });
});
