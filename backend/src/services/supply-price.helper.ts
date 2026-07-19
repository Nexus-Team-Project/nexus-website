/**
 * Pure helper that derives the catalog-facing "displayPrice" from an offer's
 * pricing inputs. The result is denormalized onto every NexusOffer so member
 * and admin catalog queries can range-filter and sort by a single indexed
 * column.
 *
 * Rule (mirrors the frontend displayPrice() helpers in MemberCatalog.tsx and
 * OfferModal.tsx):
 *   voucher   → member_price
 *   other     → market_price ?? member_price
 *   no prices → undefined  (offer is not yet priced; never matches a range
 *                           filter, never sorts to a meaningful position)
 *
 * No I/O; safe to call from any write path or backfill script.
 */
export function computeDisplayPrice(
  executionType: string | undefined,
  memberPrice: number | null | undefined,
  marketPrice: number | null | undefined,
): number | undefined {
  if (executionType === 'voucher') {
    return memberPrice ?? undefined;
  }
  return marketPrice ?? memberPrice ?? undefined;
}

/**
 * Per-tenant variant of computeDisplayPrice.
 *
 * Resolves the effective display price for one tenant's view of an offer.
 * When the tenant has overridden the voucher member price on their
 * TenantOfferConfig, that overrides the offer-level computation. Otherwise
 * falls back to the offer's own displayPrice.
 *
 * Input:
 *   executionType    - offer.executionType
 *   tocMemberPrice   - TenantOfferConfig.memberPrice (may be undefined)
 *   offerDisplayPrice - NexusOffer.displayPrice (may be undefined)
 *   offerMemberPrice - NexusOffer.member_price (may be undefined)
 *   offerMarketPrice - NexusOffer.market_price (may be undefined)
 *
 * Output: effective displayPrice for this tenant, or undefined when the
 * offer carries no price at all.
 */
export function computeTenantDisplayPrice(
  executionType: string | undefined,
  tocMemberPrice: number | null | undefined,
  offerDisplayPrice: number | null | undefined,
  offerMemberPrice: number | null | undefined,
  offerMarketPrice: number | null | undefined,
): number | undefined {
  if (executionType === 'voucher') {
    return tocMemberPrice ?? offerMemberPrice ?? undefined;
  }
  return offerDisplayPrice ?? computeDisplayPrice(executionType, offerMemberPrice, offerMarketPrice);
}

/**
 * Round a shekel amount to agorot (2 decimals), avoiding floating-point dust
 * (e.g. 36.29999999 -> 36.3). Used for every per-tenant effective price.
 */
export function roundAgorot(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Maximum markup percentage for a voucher variant: the % that lifts the base
 * sale price exactly to the face value. Returns 0 when there is no headroom
 * (face <= base) or inputs are missing/invalid.
 * Input:  base (member_price), faceValue. Output: max % (>= 0), 2dp.
 */
export function maxMarkupPct(
  base: number | null | undefined,
  faceValue: number | null | undefined,
): number {
  if (typeof base !== 'number' || base <= 0 || typeof faceValue !== 'number') return 0;
  if (faceValue <= base) return 0;
  return roundAgorot((faceValue / base - 1) * 100);
}

/**
 * Clamp a markup percentage into [0, maxMarkupPct(base, faceValue)].
 * A negative, non-finite, or too-large % is coerced into range.
 */
export function clampMarkupPct(pct: number, base: number, faceValue: number): number {
  const max = maxMarkupPct(base, faceValue);
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return pct > max ? max : pct;
}

/**
 * Effective per-tenant sale price from a markup % on the base sale price.
 * The % is clamped first, then applied, capped at faceValue, rounded to agorot.
 * Result is always within [base, faceValue].
 * Input:  base (member_price), faceValue, pct. Output: price (2dp).
 */
export function markupToPrice(base: number, faceValue: number, pct: number): number {
  const safePct = clampMarkupPct(pct, base, faceValue);
  return roundAgorot(Math.min(base * (1 + safePct / 100), faceValue));
}

/**
 * Derive the markup % that produces an absolute price on a base sale price.
 * Used to convert legacy absolute overrides into a percentage (backfill /
 * first read). Clamped into [0, maxMarkupPct].
 */
export function priceToMarkupPct(price: number, base: number, faceValue: number): number {
  if (typeof base !== 'number' || base <= 0) return 0;
  return clampMarkupPct(roundAgorot((price / base - 1) * 100), base, faceValue);
}

/**
 * Raw nexus fee amount for one variant: pct% of the margin (face - cost),
 * rounded to agorot. This is the exact amount Nexus takes on the variant,
 * independent of any adopter's own price override (receipts read this).
 * Inputs must satisfy cost <= face; pct in [0, 100] (Zod-enforced at the API).
 */
export function nexusFeeAmount(cost: number, face: number, pct: number): number {
  return roundAgorot((pct / 100) * (face - cost));
}

/**
 * Fee-inflated base price for one variant: cost + fee, rounded UP to a whole
 * shekel, capped at the face value. pct 0 -> cost; pct 100 -> face exactly.
 * This is the value baked into variant.member_price.
 */
export function applyNexusFee(cost: number, face: number, pct: number): number {
  return Math.min(face, Math.ceil(cost + (pct / 100) * (face - cost)));
}
