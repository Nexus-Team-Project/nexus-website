/**
 * Pure-math tests for the nexus fee helpers (supply-price.helper):
 *   nexusFeeAmount - raw fee = pct% of the margin (face - cost), agorot-rounded.
 *   applyNexusFee  - fee-inflated base price = ceil(cost + fee), capped at face.
 */
import { describe, it, expect } from 'vitest';
import { nexusFeeAmount, applyNexusFee } from '../../src/services/supply-price.helper';

describe('nexusFeeAmount', () => {
  it('is pct of the margin', () => {
    expect(nexusFeeAmount(200, 500, 10)).toBe(30);   // margin 300
    expect(nexusFeeAmount(200, 400, 10)).toBe(20);   // margin 200
    expect(nexusFeeAmount(50, 100, 10)).toBe(5);     // margin 50
  });
  it('is 0 at pct 0 and the full margin at pct 100', () => {
    expect(nexusFeeAmount(200, 500, 0)).toBe(0);
    expect(nexusFeeAmount(200, 500, 100)).toBe(300);
  });
  it('is 0 when there is no margin (sale price equals value)', () => {
    expect(nexusFeeAmount(400, 400, 10)).toBe(0);
  });
  it('rounds to agorot', () => {
    expect(nexusFeeAmount(100, 133, 10)).toBe(3.3);  // margin 33 -> 3.3
  });
});

describe('applyNexusFee', () => {
  it('returns the fee-inflated base, whole shekel rounded UP', () => {
    expect(applyNexusFee(200, 500, 10)).toBe(230);
    expect(applyNexusFee(100, 133, 10)).toBe(104);   // 100 + 3.3 -> ceil 104
  });
  it('pct 0 -> raw cost; pct 100 -> face value exactly', () => {
    expect(applyNexusFee(200, 500, 0)).toBe(200);
    expect(applyNexusFee(200, 500, 100)).toBe(500);
  });
  it('never exceeds face value', () => {
    expect(applyNexusFee(499, 500, 100)).toBe(500);
  });
  it('zero margin -> cost unchanged at any pct', () => {
    expect(applyNexusFee(400, 400, 55)).toBe(400);
  });
});
