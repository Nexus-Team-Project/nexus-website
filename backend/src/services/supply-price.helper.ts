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
