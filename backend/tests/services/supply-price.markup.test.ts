/**
 * Unit tests for the per-tenant voucher markup math. Pure functions, no DB.
 * base = offer's base sale price (member_price); pct is a % markup on base,
 * capped at face_value; price rounds to agorot (2dp).
 */
import { describe, it, expect } from 'vitest';
import {
  roundAgorot,
  maxMarkupPct,
  clampMarkupPct,
  markupToPrice,
  priceToMarkupPct,
} from '../../src/services/supply-price.helper';

describe('roundAgorot', () => {
  it('rounds to 2 decimals without FP dust', () => {
    expect(roundAgorot(36.299999999)).toBe(36.3);
    expect(roundAgorot(22)).toBe(22);
    expect(roundAgorot(21.005)).toBe(21.01);
  });
});

describe('maxMarkupPct', () => {
  it('is the % that lifts base to face', () => {
    expect(maxMarkupPct(20, 50)).toBe(150); // (50/20 - 1)*100
    expect(maxMarkupPct(20, 22)).toBe(10);
  });
  it('is 0 when there is no headroom or inputs are bad', () => {
    expect(maxMarkupPct(50, 50)).toBe(0);
    expect(maxMarkupPct(60, 50)).toBe(0);
    expect(maxMarkupPct(0, 50)).toBe(0);
    expect(maxMarkupPct(undefined, 50)).toBe(0);
  });
});

describe('clampMarkupPct', () => {
  it('clamps into [0, maxMarkupPct]', () => {
    expect(clampMarkupPct(-5, 20, 50)).toBe(0);
    expect(clampMarkupPct(10, 20, 50)).toBe(10);
    expect(clampMarkupPct(999, 20, 50)).toBe(150);
    expect(clampMarkupPct(Number.NaN, 20, 50)).toBe(0);
  });
});

describe('markupToPrice', () => {
  it('applies the % to base, caps at face, rounds to agorot', () => {
    expect(markupToPrice(20, 50, 10)).toBe(22);
    expect(markupToPrice(33, 100, 10)).toBe(36.3);
    expect(markupToPrice(20, 50, 999)).toBe(50); // clamped to face
    expect(markupToPrice(20, 50, 0)).toBe(20);
  });
});

describe('priceToMarkupPct', () => {
  it('derives the % that produces a price on base (for backfill)', () => {
    expect(priceToMarkupPct(22, 20, 50)).toBe(10);
    expect(priceToMarkupPct(20, 20, 50)).toBe(0);
    expect(priceToMarkupPct(50, 20, 50)).toBe(150);
    expect(priceToMarkupPct(999, 20, 50)).toBe(150); // clamped
  });
});
