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
