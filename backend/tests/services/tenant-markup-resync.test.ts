/**
 * Unit test for recomputeConfigMarkup - given a config's stored markup % map and
 * the offer's new variant bounds, produce the new cached variantPrices + clamped
 * pct. Pure, no DB.
 */
import { describe, it, expect } from 'vitest';
import { recomputeConfigMarkup } from '../../src/services/tenant-pricing.service';

const bounds = new Map([
  ['v1', { base: 25, face: 50 }], // base rose from 20 -> 25
  ['v2', { base: 40, face: 42 }], // headroom shrank: max pct now 5
]);

describe('recomputeConfigMarkup', () => {
  it('recomputes price from stored % on the new base and clamps pct to new headroom', () => {
    const out = recomputeConfigMarkup(
      { v1: 10, v2: 50 }, // stored pct: v1 10%, v2 50% (too high for new bounds)
      { v1: 22, v2: 60 }, // stale cached prices
      bounds,
    );
    expect(out.markup.v1).toBe(10);        // still valid
    expect(out.prices.v1).toBe(27.5);      // 25 * 1.10
    expect(out.markup.v2).toBe(5);         // clamped to (42/40-1)*100
    expect(out.prices.v2).toBe(42);        // capped at face
    expect(out.changed).toBe(true);
  });

  it('is a no-op when nothing changed', () => {
    const out = recomputeConfigMarkup(
      { v1: 10 },
      { v1: 27.5 },
      new Map([['v1', { base: 25, face: 50 }]]),
    );
    expect(out.changed).toBe(false);
  });
});
