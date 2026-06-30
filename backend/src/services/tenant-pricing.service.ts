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
 * Re-clamp every per-tenant member-price override for an offer back into each
 * variant's [nexus_cost, face_value] window after the offer's deal pricing was
 * edited (tenant_only offers, where the owning tenant may change nexus_cost /
 * face_value). For each TenantOfferConfig that carries variantPrices:
 *   - raise an override up to a higher new nexus_cost (so the displayed sale price
 *     never sits below the agreed floor - the "bump member price" rule), and
 *   - pull an override down to a lowered new face_value.
 * Recomputes the row's denormalized displayPrice when anything changed.
 *
 * Input:  offerId, the freshly-built variant array (carrying the new bounds).
 * Output: resolves when all affected configs are updated (no-op when none).
 */
export async function clampTenantVariantPricesToBounds(
  offerId: string,
  variants: OfferVariant[],
): Promise<void> {
  const bounds = new Map<string, { floor: number; ceil: number }>();
  for (const v of variants) {
    if (typeof v.nexus_cost === 'number' && typeof v.face_value === 'number') {
      bounds.set(v.variantId, { floor: v.nexus_cost, ceil: v.face_value });
    }
  }
  if (bounds.size === 0) return;

  const db = await getMongoDb();
  const { tenantOfferConfigs } = getSupplyDomainCollections(db);
  // Only rows that actually hold per-variant overrides can be out of bounds.
  const configs = await tenantOfferConfigs
    .find({ offerId, variantPrices: { $exists: true } })
    .toArray();

  for (const cfg of configs) {
    const current = cfg.variantPrices ?? {};
    const next: Record<string, number> = { ...current };
    let changed = false;
    for (const [variantId, price] of Object.entries(current)) {
      const b = bounds.get(variantId);
      if (!b) continue;
      const clamped = Math.min(Math.max(price, b.floor), b.ceil);
      if (clamped !== price) {
        next[variantId] = clamped;
        changed = true;
      }
    }
    if (!changed) continue;
    const displayPrice = lowestEffectiveVariantPrice(variants, next);
    await tenantOfferConfigs.updateOne(
      { configId: cfg.configId },
      { $set: { variantPrices: next, ...(displayPrice !== undefined ? { displayPrice } : {}) } },
    );
  }
}

/**
 * Re-sync per-tenant price overrides after a tenant_only offer's OWNER edited its
 * OWN sale price (nexus_cost) in the Edit Offer modal. The displayed Sale Price must
 * SNAP to the new value, so for every TenantOfferConfig of the offer:
 *   - DROP the per-variant override (`variantPrices[vid]`) for each changed variant,
 *     so its effective price falls back to the freshly-reseeded base member_price
 *     (= the new sale price); any prior slider margin on that variant is reset.
 *   - CLAMP any remaining (unchanged-variant) overrides into their new
 *     [nexus_cost, face_value] window (handles a simultaneous face_value edit).
 *   - CLEAR the legacy offer-level `memberPrice` override so a single-variant card
 *     (which reads it first) stops showing a stale value and falls back to the base.
 *   - Recompute the denormalized `displayPrice`.
 * Differs from clampTenantVariantPricesToBounds (used for ecosystem/admin edits),
 * which PRESERVES adopters' margins and only clamps.
 *
 * Input:  offerId, the freshly-built variant array (new bounds + base prices), and
 *         the set of variant ids whose nexus_cost changed.
 * Output: resolves when all affected configs are updated (no-op when nothing changed).
 */
export async function resetTenantPricesForChangedVariants(
  offerId: string,
  variants: OfferVariant[],
  changedVariantIds: Set<string>,
): Promise<void> {
  if (changedVariantIds.size === 0) return;

  const bounds = new Map<string, { floor: number; ceil: number }>();
  for (const v of variants) {
    if (typeof v.nexus_cost === 'number' && typeof v.face_value === 'number') {
      bounds.set(v.variantId, { floor: v.nexus_cost, ceil: v.face_value });
    }
  }

  const db = await getMongoDb();
  const { tenantOfferConfigs } = getSupplyDomainCollections(db);
  // Rows carrying EITHER kind of per-tenant override can be out of sync.
  const configs = await tenantOfferConfigs
    .find({ offerId, $or: [{ variantPrices: { $exists: true } }, { memberPrice: { $exists: true } }] })
    .toArray();

  for (const cfg of configs) {
    const next: Record<string, number> = { ...(cfg.variantPrices ?? {}) };
    let changed = false;
    // Drop overrides for variants whose sale price changed (snap to new base).
    for (const vid of changedVariantIds) {
      if (vid in next) { delete next[vid]; changed = true; }
    }
    // Clamp the overrides that remain into their (possibly new) bounds.
    for (const [vid, price] of Object.entries(next)) {
      const b = bounds.get(vid);
      if (!b) continue;
      const clamped = Math.min(Math.max(price, b.floor), b.ceil);
      if (clamped !== price) { next[vid] = clamped; changed = true; }
    }
    // The legacy offer-level memberPrice is no longer authoritative once the owner
    // edits per-variant deal pricing; clear it so the base price shows through.
    const clearMember = cfg.memberPrice !== undefined;
    if (!changed && !clearMember) continue;

    const displayPrice = lowestEffectiveVariantPrice(variants, next);
    const setDoc: Record<string, unknown> = {
      variantPrices: next,
      ...(displayPrice !== undefined ? { displayPrice } : {}),
    };
    await tenantOfferConfigs.updateOne(
      { configId: cfg.configId },
      clearMember ? { $set: setDoc, $unset: { memberPrice: '' } } : { $set: setDoc },
    );
  }
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
