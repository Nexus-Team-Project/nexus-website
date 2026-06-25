/**
 * Unit tests for supply-variants.helper - the pure voucher-variant logic used by
 * createOffer/updateOffer: building the variant array (synthesize-from-flat or
 * client array), representative-variant selection + mirroring, duplicate
 * detection, lowest-member-price, and variant-id generation. No DB.
 */
import { describe, it, expect } from 'vitest';
import {
  generateVariantId,
  representativeVariant,
  mirrorRepresentativeOntoOffer,
  variantSignature,
  hasDuplicateVariants,
  buildVoucherVariants,
  lowestMemberPrice,
} from '../../src/services/supply-variants.helper';
import { VARIANT_ID_REGEX, MAX_VARIANTS_PER_OFFER } from '../../src/models/domain/supply-variants.models';
import type { OfferVariant } from '../../src/models/domain/supply.models';

const v = (over: Partial<OfferVariant> = {}): OfferVariant => ({
  variantId: generateVariantId(),
  face_value: 100,
  nexus_cost: 60,
  member_price: 80,
  validityTypeOverride: null,
  voucherStackable: false,
  sku: null,
  tags: [],
  ...over,
});

describe('generateVariantId', () => {
  it('matches the variant-id format and is unique', () => {
    const a = generateVariantId();
    const b = generateVariantId();
    expect(a).toMatch(VARIANT_ID_REGEX);
    expect(b).toMatch(VARIANT_ID_REGEX);
    expect(a).not.toBe(b);
  });
});

describe('representativeVariant / lowestMemberPrice', () => {
  it('returns the variant with the lowest member price', () => {
    const cheap = v({ member_price: 50 });
    const dear = v({ member_price: 90 });
    expect(representativeVariant([dear, cheap])?.member_price).toBe(50);
    expect(lowestMemberPrice([dear, cheap])).toBe(50);
  });

  it('is undefined for an empty/missing array', () => {
    expect(representativeVariant([])).toBeUndefined();
    expect(representativeVariant(undefined)).toBeUndefined();
    expect(lowestMemberPrice(undefined)).toBeUndefined();
  });
});

describe('mirrorRepresentativeOntoOffer', () => {
  it('mirrors the representative variant fields onto the offer', () => {
    const m = mirrorRepresentativeOntoOffer([
      v({ member_price: 90, sku: 'BIG-2026', tags: ['x'] }),
      v({ member_price: 40, face_value: 50, nexus_cost: 30, sku: 'SML-2026', tags: ['y'] }),
    ]);
    expect(m.member_price).toBe(40);
    expect(m.face_value).toBe(50);
    expect(m.nexus_cost).toBe(30);
    expect(m.sku).toBe('SML-2026');
    expect(m.tags).toEqual(['y']);
  });

  it('returns an empty object when there is no variant', () => {
    expect(mirrorRepresentativeOntoOffer([])).toEqual({});
  });
});

describe('variantSignature / hasDuplicateVariants', () => {
  it('treats variants with identical configurable values as duplicates', () => {
    const a = v({ member_price: 80 });
    const b = v({ member_price: 80 });
    expect(variantSignature(a)).toBe(variantSignature(b));
    expect(hasDuplicateVariants([a, b])).toBe(true);
  });

  it('treats variants differing in any field as distinct', () => {
    expect(hasDuplicateVariants([v({ member_price: 80 }), v({ member_price: 70 })])).toBe(false);
    expect(hasDuplicateVariants([v({ sku: 'AAAA' }), v({ sku: 'BBBB' })])).toBe(false);
  });
});

describe('buildVoucherVariants', () => {
  it('synthesizes one variant from the flat fields when no array is given', () => {
    const out = buildVoucherVariants(undefined, { face_value: 100, nexus_cost: 60, voucherStackable: true });
    expect(out).toHaveLength(1);
    expect(out[0].variantId).toMatch(VARIANT_ID_REGEX);
    // member_price defaults to nexus_cost when omitted.
    expect(out[0].member_price).toBe(60);
    expect(out[0].voucherStackable).toBe(true);
  });

  it('keeps a valid incoming variantId and generates one when absent', () => {
    const kept = 'var_abc123def456';
    const out = buildVoucherVariants(
      [{ variantId: kept, face_value: 100, nexus_cost: 60, member_price: 80 }, { face_value: 50, nexus_cost: 30 }],
      {},
    );
    expect(out[0].variantId).toBe(kept);
    expect(out[1].variantId).toMatch(VARIANT_ID_REGEX);
  });

  it('rejects duplicate variants (400)', () => {
    const dup = { face_value: 100, nexus_cost: 60, member_price: 80 };
    try {
      buildVoucherVariants([dup, { ...dup }], {});
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
    }
  });

  it('rejects more than the max variants (400)', () => {
    const many = Array.from({ length: MAX_VARIANTS_PER_OFFER + 1 }, (_, i) => ({
      face_value: 100, nexus_cost: 60, member_price: 50 + i,
    }));
    try {
      buildVoucherVariants(many, {});
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
    }
  });
});

describe('validity type override (value is per unit, not the variant)', () => {
  it('signature ignores the validity type override - it does not distinguish variants', () => {
    const a = v({ validityTypeOverride: 'limit' });
    const b = v({ validityTypeOverride: 'from_until' });
    // Same price/stackable/sku/redemption => same signature, regardless of type.
    expect(variantSignature(a)).toBe(variantSignature(b));
    expect(hasDuplicateVariants([a, b])).toBe(true);
  });

  it('two variants intended to differ only by date are duplicates (date is per unit now)', () => {
    // No date fields exist on a variant anymore; identical priced variants collide.
    const a = v({ member_price: 80 });
    const b = v({ member_price: 80 });
    expect(hasDuplicateVariants([a, b])).toBe(true);
  });

  it('buildVoucherVariants carries the type override and stores no validity value', () => {
    const [out] = buildVoucherVariants(
      [{ face_value: 100, nexus_cost: 60, member_price: 80, validityTypeOverride: 'from_until' }],
      {},
    );
    expect(out.validityTypeOverride).toBe('from_until');
    expect(out).not.toHaveProperty('voucherValidityValue');
    expect(out).not.toHaveProperty('validFrom');
  });

  it('buildVoucherVariants defaults the type override to null (inherit parent)', () => {
    const [out] = buildVoucherVariants(
      [{ face_value: 100, nexus_cost: 60, member_price: 80 }],
      {},
    );
    expect(out.validityTypeOverride).toBeNull();
  });
});
