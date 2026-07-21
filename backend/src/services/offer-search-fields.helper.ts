/**
 * Derived search/sort fields denormalized onto NexusOffer at write time.
 *
 * Two field groups, both consumed by the catalog-search module:
 *   descriptionText            - plain-text mirror of the rich-HTML description
 *                                (search must never match markup).
 *   cashbackMinPct/MaxPct      - the offer's BASE cashback range, derived per
 *                                variant from face_value vs the fee-baked base
 *                                member_price (same formula the wallet renders),
 *                                aggregated to offer-level min/max. null when no
 *                                variant yields cashback (non-vouchers, unpriced,
 *                                or price >= face). Indexed for Mongo sorting.
 *
 * IMPORTANT: call `offerSearchWriteFields` from EVERY write path that recomputes
 * displayPrice (offer create/update, nexus-fee re-bake, variant sale-price edit)
 * so the stored range never drifts from the priced variants. Per-tenant price
 * overrides deliberately do NOT touch these fields - they are the BASE range;
 * the member feed adjusts for overrides at query time (see catalog-search).
 *
 * Pure functions, no I/O; safe for write paths, tests, and backfill scripts.
 */
import { htmlToPlainText } from '../utils/html-text';

/** The minimal variant shape cashback derivation needs. */
export interface CashbackPricedVariant {
  face_value?: number | null;
  member_price?: number | null;
}

/** Base cashback range stamped onto the offer. null = no cashback anywhere. */
export interface BaseCashbackFields {
  cashbackMinPct: number | null;
  cashbackMaxPct: number | null;
}

/**
 * Cashback percent for one priced variant: round(min(100, (face - price)/face * 100)).
 * Mirrors the wallet's computeOfferCashback. undefined when inputs are missing,
 * non-positive, or the price gives no saving (price >= face).
 */
export function variantCashbackPct(
  faceValue: number | null | undefined,
  memberPrice: number | null | undefined,
): number | undefined {
  if (typeof faceValue !== 'number' || faceValue <= 0) return undefined;
  if (typeof memberPrice !== 'number' || memberPrice <= 0) return undefined;
  if (memberPrice >= faceValue) return undefined;
  return Math.round(Math.min(100, ((faceValue - memberPrice) / faceValue) * 100));
}

/**
 * Offer-level base cashback range across variants (or the flat single-variant
 * fields when no variant array exists - legacy/pre-variant documents).
 * Input:  variants + flat fallback face/member price.
 * Output: { cashbackMinPct, cashbackMaxPct } - both null when nothing yields cashback.
 */
export function baseCashbackFields(
  variants: CashbackPricedVariant[] | undefined,
  flatFaceValue?: number | null,
  flatMemberPrice?: number | null,
): BaseCashbackFields {
  const source: CashbackPricedVariant[] =
    variants && variants.length > 0
      ? variants
      : [{ face_value: flatFaceValue, member_price: flatMemberPrice }];
  const pcts = source
    .map((v) => variantCashbackPct(v.face_value, v.member_price))
    .filter((p): p is number => p !== undefined);
  if (pcts.length === 0) return { cashbackMinPct: null, cashbackMaxPct: null };
  return { cashbackMinPct: Math.min(...pcts), cashbackMaxPct: Math.max(...pcts) };
}

/**
 * All derived search fields for one offer write, ready to spread into a Mongo
 * $set / insert document.
 * Input:  description (pass undefined to leave descriptionText untouched on a
 *         partial update), variants + flat price fallbacks.
 * Output: partial with cashback fields always present, descriptionText only
 *         when a description was provided.
 */
export function offerSearchWriteFields(args: {
  description?: string;
  variants?: CashbackPricedVariant[];
  flatFaceValue?: number | null;
  flatMemberPrice?: number | null;
}): BaseCashbackFields & { descriptionText?: string } {
  return {
    ...(args.description !== undefined && { descriptionText: htmlToPlainText(args.description) }),
    ...baseCashbackFields(args.variants, args.flatFaceValue, args.flatMemberPrice),
  };
}
