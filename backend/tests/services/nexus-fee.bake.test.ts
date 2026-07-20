/**
 * buildVoucherVariants bakes the nexus fee into member_price:
 *   - member_price = applyNexusFee(cost, face, feePct) when cost+face defined
 *   - client-sent member_price is ignored (the platform owns the base price)
 *   - variants missing cost or face keep the legacy member ?? cost fallback
 */
import { describe, it, expect } from 'vitest';
import { buildVoucherVariants } from '../../src/services/supply-variants.helper';

describe('buildVoucherVariants fee bake', () => {
  it('derives member_price from the fee, per variant', () => {
    const built = buildVoucherVariants(
      [
        { face_value: 500, nexus_cost: 200 },
        { face_value: 400, nexus_cost: 200 },
        { face_value: 100, nexus_cost: 50 },
      ],
      {},
      10,
    );
    expect(built.map((v) => v.member_price)).toEqual([230, 220, 55]);
  });

  it('ignores a client-sent member_price when cost+face are present', () => {
    const built = buildVoucherVariants(
      [{ face_value: 500, nexus_cost: 200, member_price: 999 }],
      {},
      10,
    );
    expect(built[0].member_price).toBe(230);
  });

  it('pct 0 keeps the raw sale price', () => {
    const built = buildVoucherVariants([{ face_value: 500, nexus_cost: 200 }], {}, 0);
    expect(built[0].member_price).toBe(200);
  });

  it('falls back to member ?? cost when face_value is missing', () => {
    const built = buildVoucherVariants([{ nexus_cost: 200 }], {}, 10);
    expect(built[0].member_price).toBe(200);
  });
});
