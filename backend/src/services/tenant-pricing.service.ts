/**
 * tenant-pricing.service.ts
 *
 * Single-purpose service: lets one tenant set its per-offer voucher
 * member price. Writes to TenantOfferConfig.memberPrice + recomputes
 * the row's displayPrice for catalog sort/filter.
 *
 * Security: the route layer is responsible for verifying that the
 * caller belongs to `tenantId`. This service additionally validates
 * the offer exists, is a voucher, is adopted by that tenant, and that
 * the new price falls within [nexus_cost, face_value].
 */

import { getMongoDb } from '../config/mongo';
import {
  getSupplyDomainCollections,
  NOT_DELETED,
  type TenantOfferConfig,
  type OfferVariant,
} from '../models/domain/supply.models';
import { VARIANT_ID_REGEX } from '../models/domain/supply-variants.models';
import { computeTenantDisplayPrice } from './supply-price.helper';

/** Input contract for setTenantVoucherPrice. */
export interface SetTenantVoucherPriceInput {
  tenantId: string;
  offerId: string;
  memberPrice: number;
  /**
   * When set, the price is stored for THIS variant only (per-variant per-tenant
   * pricing). Omitted -> the legacy offer-level memberPrice path. Required for
   * multi-variant vouchers; the bounds come from the variant, not the offer.
   */
  variantId?: string;
}

/**
 * Possible failure reasons. The route maps these to HTTP status codes:
 *   offer_not_found    -> 404
 *   not_voucher        -> 400
 *   variant_not_found  -> 404
 *   not_adopted        -> 404 / 409 (route decides)
 *   out_of_bounds      -> 400
 */
export type SetTenantVoucherPriceError =
  | 'offer_not_found'
  | 'not_voucher'
  | 'variant_not_found'
  | 'not_adopted'
  | 'out_of_bounds';

/**
 * Lowest effective per-tenant member price across the offer's variants, given a
 * per-variant override map. Used as the denormalized TenantOfferConfig.displayPrice
 * so this tenant's catalog sort/filter reflects their cheapest variant.
 */
function lowestEffectiveVariantPrice(
  variants: OfferVariant[] | undefined,
  overrides: Record<string, number>,
): number | undefined {
  const prices = (variants ?? [])
    .map((v) => overrides[v.variantId] ?? v.member_price)
    .filter((n): n is number => typeof n === 'number');
  return prices.length > 0 ? Math.min(...prices) : undefined;
}

/**
 * Set the per-tenant voucher member price.
 *
 * Steps:
 *   1. Load offer by offerId; ensure it exists and is a voucher.
 *   2. Bounds-check memberPrice against [nexus_cost, face_value].
 *   3. Verify an active TenantOfferConfig row exists for this tenant.
 *   4. Recompute displayPrice via computeTenantDisplayPrice.
 *   5. Persist memberPrice (+ displayPrice when defined) and return the
 *      refreshed config row.
 *
 * Output:
 *   { ok: true, config }  - updated TenantOfferConfig row
 *   { ok: false, reason } - one of SetTenantVoucherPriceError values
 */
export async function setTenantVoucherPrice(
  input: SetTenantVoucherPriceInput,
): Promise<
  | { ok: true; config: TenantOfferConfig }
  | { ok: false; reason: SetTenantVoucherPriceError }
> {
  const { tenantId, offerId, memberPrice, variantId } = input;

  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  // 1. Offer must exist (and not be soft-deleted).
  const offer = await nexusOffers.findOne({ offerId, ...NOT_DELETED });
  if (!offer) {
    return { ok: false, reason: 'offer_not_found' };
  }

  // 2. Must be a voucher; only vouchers carry the nexus_cost/face_value bounds
  //    that this service enforces.
  if (offer.executionType !== 'voucher') {
    return { ok: false, reason: 'not_voucher' };
  }

  // 3. Resolve the price bounds. Per-variant: the bounds come from the named
  //    variant. Offer-level (legacy): from the offer's mirrored fields. The
  //    variantId is format-checked so it is always safe as a Mongo dot-path key.
  let floor: number | null | undefined;
  let ceiling: number | null | undefined;
  if (variantId !== undefined) {
    if (!VARIANT_ID_REGEX.test(variantId)) {
      return { ok: false, reason: 'variant_not_found' };
    }
    const variant = (offer.variants ?? []).find((v) => v.variantId === variantId);
    if (!variant) {
      return { ok: false, reason: 'variant_not_found' };
    }
    floor = variant.nexus_cost;
    ceiling = variant.face_value;
  } else {
    floor = offer.nexus_cost;
    ceiling = offer.face_value;
  }

  // 4. Bounds-check. nexus_cost is the floor (we never sell below cost) and
  //    face_value is the ceiling (we never sell above the printed value of
  //    the voucher). Missing either bound means it is misconfigured for
  //    per-tenant pricing - reject conservatively.
  if (
    floor === undefined ||
    floor === null ||
    ceiling === undefined ||
    ceiling === null ||
    memberPrice < floor ||
    memberPrice > ceiling
  ) {
    return { ok: false, reason: 'out_of_bounds' };
  }

  // 5. Tenant must have an active adoption row for this offer. Excluded /
  //    missing rows cannot be priced.
  const existing = await tenantOfferConfigs.findOne({
    tenantId,
    offerId,
    adoptionStatus: 'active',
  });
  if (!existing) {
    return { ok: false, reason: 'not_adopted' };
  }

  // 6. Recompute denormalized displayPrice so catalog server-side sort/filter
  //    sees the tenant override immediately, and build the $set.
  let update: Record<string, unknown>;
  if (variantId !== undefined) {
    // Per-variant: merge into the variantPrices map and derive displayPrice from
    // the lowest effective price across all variants.
    const nextOverrides = { ...(existing.variantPrices ?? {}), [variantId]: memberPrice };
    const displayPrice = lowestEffectiveVariantPrice(offer.variants, nextOverrides);
    update = {
      [`variantPrices.${variantId}`]: memberPrice,
      ...(displayPrice !== undefined ? { displayPrice } : {}),
    };
  } else {
    const displayPrice = computeTenantDisplayPrice(
      offer.executionType,
      memberPrice,
      offer.displayPrice,
      offer.member_price,
      offer.market_price,
    );
    update = {
      memberPrice,
      ...(displayPrice !== undefined ? { displayPrice } : {}),
    };
  }

  await tenantOfferConfigs.updateOne(
    { configId: existing.configId },
    { $set: update },
  );

  // 6. Re-fetch so callers get the post-update row (including any other
  //    fields they may surface to the UI).
  const updated = await tenantOfferConfigs.findOne({ configId: existing.configId });
  if (!updated) {
    // Should never happen - the row was just confirmed and updated. Treat as
    // a not_adopted race rather than throwing into the route handler.
    return { ok: false, reason: 'not_adopted' };
  }

  return { ok: true, config: updated as TenantOfferConfig };
}
