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
 * the new price falls within [0, face_value] (below the base cost is a
 * tenant-funded member subsidy; 0 is free).
 */

import { getMongoDb } from '../config/mongo';
import {
  getSupplyDomainCollections,
  NOT_DELETED,
  type TenantOfferConfig,
  type OfferVariant,
} from '../models/domain/supply.models';
import { VARIANT_ID_REGEX } from '../models/domain/supply-variants.models';
import {
  computeTenantDisplayPrice,
  markupToPrice,
  clampMarkupPct,
} from './supply-price.helper';

/** Input contract for setTenantVoucherPrice. */
export interface SetTenantVoucherPriceInput {
  tenantId: string;
  offerId: string;
  /**
   * Absolute sale price (>= 0), the shekel price customers pay. Clamped into
   * [0, face_value]: 0 is free and any value below the base cost is a subsidy
   * the tenant gives the member. Preferred over markupPct; when set, the stored
   * markup % for the target variant/offer is cleared.
   */
  memberPrice?: number;
  /**
   * Legacy: markup percentage on the base sale price (>= 0). The effective price
   * is `min(base*(1+pct/100), face_value)`; the % is clamped into the
   * offer/variant headroom before it is applied and stored. Used only when
   * memberPrice is omitted.
   */
  markupPct?: number;
  /**
   * When set, the % is stored for THIS variant only (per-variant per-tenant
   * pricing). Omitted -> the legacy offer-level path. Required for
   * multi-variant vouchers; the base/ceiling come from the variant, not the offer.
   */
  variantId?: string;
  /**
   * True when the caller is a NEXUS platform admin. Platform admins bypass the
   * owning-tenant price lock (the tenant that UPLOADED an offer may not set a
   * per-tenant selling price on it - it sets the real sale price on the offer
   * itself via Edit Offer). Defaults to false.
   */
  isPlatformAdmin?: boolean;
}

/**
 * Possible failure reasons. The route maps these to HTTP status codes:
 *   offer_not_found    -> 404
 *   not_voucher        -> 400
 *   variant_not_found  -> 404
 *   not_adopted        -> 404 / 409 (route decides)
 *   out_of_bounds      -> 400
 *   owner_locked       -> 403 (offer is Nexus-managed for its owning tenant)
 */
export type SetTenantVoucherPriceError =
  | 'offer_not_found'
  | 'not_voucher'
  | 'variant_not_found'
  | 'not_adopted'
  | 'out_of_bounds'
  | 'owner_locked';

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
 * Build a per-variant bounds map { variantId -> { base, face } } from the offer's
 * variants. base = member_price (the number the markup % applies to), falling back
 * to nexus_cost; face = face_value. Variants missing either are skipped.
 */
function boundsByVariant(
  variants: OfferVariant[],
): Map<string, { base: number; face: number }> {
  const m = new Map<string, { base: number; face: number }>();
  for (const v of variants) {
    const base = v.member_price ?? v.nexus_cost;
    if (typeof base === 'number' && typeof v.face_value === 'number') {
      m.set(v.variantId, { base, face: v.face_value });
    }
  }
  return m;
}

/**
 * Recompute one config's cached voucher prices from its stored markup % after the
 * offer's variant bounds changed. For each variant the config has a % for:
 *   - clamp the % into the variant's new [0, maxMarkupPct] headroom, and
 *   - set price = markupToPrice(newBase, newFace, clampedPct).
 * Variants with no stored % are left untouched (handled by the caller's legacy
 * clamp/snap). Pure: no I/O. Returns the next maps + whether anything changed.
 */
export function recomputeConfigMarkup(
  markup: Record<string, number>,
  prices: Record<string, number>,
  bounds: Map<string, { base: number; face: number }>,
): { markup: Record<string, number>; prices: Record<string, number>; changed: boolean } {
  const nextMarkup = { ...markup };
  const nextPrices = { ...prices };
  let changed = false;
  for (const [vid, pct] of Object.entries(markup)) {
    const b = bounds.get(vid);
    if (!b) continue;
    const clamped = clampMarkupPct(pct, b.base, b.face);
    const price = markupToPrice(b.base, b.face, clamped);
    if (clamped !== nextMarkup[vid]) { nextMarkup[vid] = clamped; changed = true; }
    if (price !== nextPrices[vid]) { nextPrices[vid] = price; changed = true; }
  }
  return { markup: nextMarkup, prices: nextPrices, changed };
}

/**
 * Re-clamp every per-tenant member-price override for an offer back into each
 * variant's [0, face_value] window after the offer's deal pricing was edited
 * (tenant_only offers, where the owning tenant may change nexus_cost /
 * face_value). For each TenantOfferConfig that carries variantPrices:
 *   - pull an override down to a lowered new face_value (the only ceiling), and
 *   - leave a below-cost override alone (a tenant may sell below cost - down to
 *     free - as a member subsidy, so the floor is 0, not nexus_cost).
 * Recomputes the row's denormalized displayPrice when anything changed.
 *
 * Input:  offerId, the freshly-built variant array (carrying the new bounds).
 * Output: resolves when all affected configs are updated (no-op when none).
 */
export async function clampTenantVariantPricesToBounds(
  offerId: string,
  variants: OfferVariant[],
): Promise<void> {
  const bounds = boundsByVariant(variants);
  if (bounds.size === 0) return;

  const db = await getMongoDb();
  const { tenantOfferConfigs } = getSupplyDomainCollections(db);
  // Rows holding a per-variant markup % OR an absolute override can be out of sync.
  const configs = await tenantOfferConfigs
    .find({ offerId, $or: [{ variantMarkupPct: { $exists: true } }, { variantPrices: { $exists: true } }] })
    .toArray();

  for (const cfg of configs) {
    // 1. Recompute %-backed prices from the new base + clamp the % to new headroom.
    const rec = recomputeConfigMarkup(cfg.variantMarkupPct ?? {}, cfg.variantPrices ?? {}, bounds);
    const nextMarkup = rec.markup;
    const nextPrices = rec.prices;
    let changed = rec.changed;

    // 2. Legacy: clamp any absolute override that has NO stored % into its
    //    [0, face_value] window (preserves the adopter's margin / subsidy).
    for (const [variantId, price] of Object.entries(nextPrices)) {
      if (variantId in nextMarkup) continue; // handled by the markup recompute above
      const v = variants.find((x) => x.variantId === variantId);
      if (!v || typeof v.face_value !== 'number') continue;
      // Floor is 0 (not nexus_cost): a tenant may price a voucher below cost - down
      // to free - as a member subsidy, so only clamp overrides down to the new
      // face_value ceiling, never up off a below-cost subsidy.
      const clamped = Math.min(Math.max(price, 0), v.face_value);
      if (clamped !== price) { nextPrices[variantId] = clamped; changed = true; }
    }

    if (!changed) continue;
    const displayPrice = lowestEffectiveVariantPrice(variants, nextPrices);
    await tenantOfferConfigs.updateOne(
      { configId: cfg.configId },
      { $set: { variantMarkupPct: nextMarkup, variantPrices: nextPrices, ...(displayPrice !== undefined ? { displayPrice } : {}) } },
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

  const bounds = boundsByVariant(variants);

  const db = await getMongoDb();
  const { tenantOfferConfigs } = getSupplyDomainCollections(db);
  // Rows carrying a per-variant % / absolute override, or a legacy offer-level
  // cache, can be out of sync after the owner changed the sale price.
  const configs = await tenantOfferConfigs
    .find({ offerId, $or: [{ variantMarkupPct: { $exists: true } }, { variantPrices: { $exists: true } }, { memberPrice: { $exists: true } }] })
    .toArray();

  for (const cfg of configs) {
    // 1. Recompute %-backed prices from the new base (the % persists; the cached
    //    price snaps to base*(1+pct/100)).
    const rec = recomputeConfigMarkup(cfg.variantMarkupPct ?? {}, cfg.variantPrices ?? {}, bounds);
    const nextMarkup = rec.markup;
    const nextPrices = rec.prices;
    let changed = rec.changed;

    // 2. Legacy absolute-only variants (no stored %): drop the override for a
    //    variant whose sale price changed (snap to new base), clamp the rest.
    for (const vid of changedVariantIds) {
      if (vid in nextMarkup) continue; // handled by the markup recompute above
      if (vid in nextPrices) { delete nextPrices[vid]; changed = true; }
    }
    for (const [vid, price] of Object.entries(nextPrices)) {
      if (vid in nextMarkup) continue;
      const v = variants.find((x) => x.variantId === vid);
      if (!v || typeof v.face_value !== 'number') continue;
      // Floor is 0 (not nexus_cost): a tenant may price a voucher below cost - down
      // to free - as a member subsidy, so only clamp overrides down to the new
      // face_value ceiling, never up off a below-cost subsidy.
      const clamped = Math.min(Math.max(price, 0), v.face_value);
      if (clamped !== price) { nextPrices[vid] = clamped; changed = true; }
    }

    // 3. Clear the legacy offer-level cache (memberPrice + markupPct) so the base
    //    price shows through once the owner edits per-variant deal pricing.
    const clearLegacy = cfg.memberPrice !== undefined || cfg.markupPct !== undefined;
    if (!changed && !clearLegacy) continue;

    const displayPrice = lowestEffectiveVariantPrice(variants, nextPrices);
    const setDoc: Record<string, unknown> = {
      variantMarkupPct: nextMarkup,
      variantPrices: nextPrices,
      ...(displayPrice !== undefined ? { displayPrice } : {}),
    };
    await tenantOfferConfigs.updateOne(
      { configId: cfg.configId },
      clearLegacy ? { $set: setDoc, $unset: { memberPrice: '', markupPct: '' } } : { $set: setDoc },
    );
  }
}

/**
 * Set the per-tenant voucher markup percentage.
 *
 * Steps:
 *   1. Load offer by offerId; ensure it exists and is a voucher.
 *   2. Resolve base (member_price) + ceiling (face_value); clamp the % into
 *      [0, maxMarkupPct] and compute the cached effective price.
 *   3. Verify an active TenantOfferConfig row exists for this tenant.
 *   4. Recompute displayPrice from the cached price.
 *   5. Persist the % + its cached price (+ displayPrice when defined) and return
 *      the refreshed config row.
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
  const { tenantId, offerId, memberPrice, markupPct, variantId, isPlatformAdmin } = input;

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

  // 2b. The tenant that UPLOADED this offer (createdByTenantId === caller) may NOT
  //     set a per-tenant selling price on it via the markup slider - it sets the
  //     real sale price on the offer itself (Edit Offer). This holds whether or
  //     not the owner adopted the offer, and whether or not a Nexus admin uploaded
  //     it on their behalf. Platform admins are exempt. Adopting tenants
  //     (createdByTenantId !== caller) are unaffected and keep their own price.
  if (!isPlatformAdmin && offer.createdByTenantId === tenantId) {
    return { ok: false, reason: 'owner_locked' };
  }

  // 3. Resolve base (the number the % applies to = member_price) + ceiling
  //    (face_value). Per-variant: from the named variant. Offer-level (legacy):
  //    from the offer's mirrored fields. The variantId is format-checked so it is
  //    always safe as a Mongo dot-path key.
  let base: number | null | undefined;
  let ceiling: number | null | undefined;
  if (variantId !== undefined) {
    if (!VARIANT_ID_REGEX.test(variantId)) {
      return { ok: false, reason: 'variant_not_found' };
    }
    const variant = (offer.variants ?? []).find((v) => v.variantId === variantId);
    if (!variant) {
      return { ok: false, reason: 'variant_not_found' };
    }
    base = variant.member_price ?? variant.nexus_cost;
    ceiling = variant.face_value;
  } else {
    base = offer.member_price ?? offer.nexus_cost;
    ceiling = offer.face_value;
  }

  // 4. Base + ceiling must be configured. face_value is the ceiling (the price
  //    is capped there); the floor is 0 (free) for an absolute price, or the base
  //    sale price for the legacy markup path. Missing either means the
  //    offer/variant is misconfigured for per-tenant pricing - reject conservatively.
  if (base === undefined || base === null || ceiling === undefined || ceiling === null) {
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

  // 6. Resolve the cached effective price. The dashboard sends an ABSOLUTE price
  //    (memberPrice) clamped into [base, face_value] and rounded UP to a whole
  //    shekel: the tenant may never price below the base sale price, and every
  //    stored price is a round number (mirrors + enforces the popover UI so a
  //    crafted request cannot bypass either rule). The legacy path (markupPct
  //    only) clamps a % into the headroom and applies it - its floor is already
  //    the base (0% = base). variantPrices / memberPrice is the cached projection
  //    so the catalog read/sort/filter path is unchanged. When an absolute price
  //    is set, the stored markup % for the target is cleared ($unset) so a later
  //    deal-price re-sync treats it as an absolute override (preserved) rather
  //    than recomputing it from a stale %.
  // Both branches produce a WHOLE-shekel price rounded UP and capped at the
  // face value. The absolute path floors at the base (no below-base pricing);
  // the legacy markup path is already floored at the base (0% = base), so it
  // only needs the same whole-shekel rounding applied to its projection.
  const useAbsolute = memberPrice !== undefined;
  const rawPrice = useAbsolute
    ? Math.max(memberPrice, base)
    : markupToPrice(base, ceiling, clampMarkupPct(markupPct ?? 0, base, ceiling));
  const price = Math.min(Math.ceil(rawPrice), ceiling);

  let setOps: Record<string, unknown>;
  let unsetOps: Record<string, ''> | undefined;
  if (variantId !== undefined) {
    // Per-variant: cache the price, derive displayPrice from the lowest effective
    // price across all variants.
    const nextOverrides = { ...(existing.variantPrices ?? {}), [variantId]: price };
    const displayPrice = lowestEffectiveVariantPrice(offer.variants, nextOverrides);
    setOps = {
      [`variantPrices.${variantId}`]: price,
      ...(displayPrice !== undefined ? { displayPrice } : {}),
    };
    if (useAbsolute) {
      unsetOps = { [`variantMarkupPct.${variantId}`]: '' };
    } else {
      setOps[`variantMarkupPct.${variantId}`] = clampMarkupPct(markupPct ?? 0, base, ceiling);
    }
  } else {
    const displayPrice = computeTenantDisplayPrice(
      offer.executionType,
      price,
      offer.displayPrice,
      offer.member_price,
      offer.market_price,
    );
    setOps = {
      memberPrice: price,
      ...(displayPrice !== undefined ? { displayPrice } : {}),
    };
    if (useAbsolute) {
      unsetOps = { markupPct: '' };
    } else {
      setOps.markupPct = clampMarkupPct(markupPct ?? 0, base, ceiling);
    }
  }

  await tenantOfferConfigs.updateOne(
    { configId: existing.configId },
    unsetOps ? { $set: setOps, $unset: unsetOps } : { $set: setOps },
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
