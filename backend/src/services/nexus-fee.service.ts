/**
 * Nexus fee service - platform-admin editing of an offer's nexusFeePct.
 *
 * The fee is a percentage of each variant's margin (face_value - nexus_cost),
 * BAKED into variant.member_price (the per-tenant floor + default price) at
 * write time. Changing the pct re-bakes every variant, re-mirrors the
 * representative variant onto the legacy top-level fields, recomputes the
 * denormalized displayPrice, and re-syncs adopter overrides to the new floor.
 *
 * Gate (route-enforced): platform admin only. Voucher offers only.
 */
import { getMongoDb } from '../config/mongo';
import {
  getSupplyDomainCollections,
  NOT_DELETED,
  NEXUS_FEE_DEFAULT_PCT,
  type NexusOffer,
} from '../models/domain/supply.models';
import { applyNexusFee, computeDisplayPrice } from './supply-price.helper';
import { mirrorRepresentativeOntoOffer, lowestMemberPrice } from './supply-variants.helper';
import {
  syncTenantPricesToFeeFloor,
  resetTenantPricesForChangedVariants,
} from './tenant-pricing.service';

/** Failure reasons mapped to HTTP codes by the route (404 / 400). */
export type SetNexusFeeResult =
  | { ok: true; offer: NexusOffer }
  | { ok: false; reason: 'offer_not_found' | 'not_voucher' };

/**
 * Sets a voucher offer's nexusFeePct and re-bakes all derived pricing.
 * Input: offerId + pct (int 0..100, Zod-validated at the route).
 * Output: the updated offer, or a typed failure reason.
 */
export async function setNexusFeePct(offerId: string, pct: number): Promise<SetNexusFeeResult> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  const offer = await nexusOffers.findOne({ offerId, ...NOT_DELETED });
  if (!offer) return { ok: false, reason: 'offer_not_found' };
  if (offer.executionType !== 'voucher') return { ok: false, reason: 'not_voucher' };

  // Re-bake: derive each priced variant's member_price from the new pct.
  const rebaked = (offer.variants ?? []).map((v) =>
    v.nexus_cost !== undefined && v.face_value !== undefined
      ? { ...v, member_price: applyNexusFee(v.nexus_cost, v.face_value, pct) }
      : v,
  );
  const mirror = mirrorRepresentativeOntoOffer(rebaked);
  const displayPrice = computeDisplayPrice('voucher', lowestMemberPrice(rebaked), offer.market_price);

  const result = await nexusOffers.findOneAndUpdate(
    { offerId, ...NOT_DELETED },
    {
      $set: {
        nexusFeePct: pct,
        ...(rebaked.length > 0 && { variants: rebaked }),
        ...mirror,
        ...(displayPrice !== undefined && { displayPrice }),
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  if (!result) return { ok: false, reason: 'offer_not_found' };

  // Adopter overrides below the new floor snap up; above are preserved.
  await syncTenantPricesToFeeFloor(offerId, rebaked);

  return { ok: true, offer: result };
}

/** Failure reasons for setVariantBaseSalePrice, mapped to HTTP codes by the route. */
export type SetBaseSalePriceResult =
  | { ok: true; offer: NexusOffer }
  | { ok: false; reason: 'offer_not_found' | 'not_voucher' | 'variant_not_found' | 'out_of_bounds' };

/**
 * PLATFORM-ADMIN edit of one variant's sale price (nexus_cost) from the price
 * popover's main slider. The fee % is untouched; the variant's member_price
 * re-bakes as applyNexusFee(newCost, face, storedPct), the representative
 * mirror + displayPrice recompute, and adopter overrides re-sync (tenant_only
 * SNAPS the displayed price to the new base; ecosystem preserves margins above
 * the fee floor via the fee-aware sync).
 *
 * Input: offerId, variantId, salePrice (> 0, <= the variant's face_value).
 * Output: the updated offer, or a typed failure reason.
 */
export async function setVariantBaseSalePrice(
  offerId: string,
  variantId: string,
  salePrice: number,
): Promise<SetBaseSalePriceResult> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  const offer = await nexusOffers.findOne({ offerId, ...NOT_DELETED });
  if (!offer) return { ok: false, reason: 'offer_not_found' };
  if (offer.executionType !== 'voucher') return { ok: false, reason: 'not_voucher' };

  const target = (offer.variants ?? []).find((v) => v.variantId === variantId);
  if (!target) return { ok: false, reason: 'variant_not_found' };
  if (
    !Number.isFinite(salePrice) || salePrice <= 0
    || typeof target.face_value !== 'number' || salePrice > target.face_value
  ) {
    return { ok: false, reason: 'out_of_bounds' };
  }

  // Re-bake the target variant from the new cost + the offer's stored fee %.
  const pct = offer.nexusFeePct ?? NEXUS_FEE_DEFAULT_PCT;
  const rebaked = (offer.variants ?? []).map((v) =>
    v.variantId === variantId
      ? { ...v, nexus_cost: salePrice, member_price: applyNexusFee(salePrice, target.face_value as number, pct) }
      : v,
  );
  const mirror = mirrorRepresentativeOntoOffer(rebaked);
  const displayPrice = computeDisplayPrice('voucher', lowestMemberPrice(rebaked), offer.market_price);

  const result = await nexusOffers.findOneAndUpdate(
    { offerId, ...NOT_DELETED },
    {
      $set: {
        variants: rebaked,
        ...mirror,
        ...(displayPrice !== undefined && { displayPrice }),
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  if (!result) return { ok: false, reason: 'offer_not_found' };

  // Same visibility split as updateOffer's deal-price re-sync (best-effort),
  // except ecosystem uses the FEE-AWARE sync: margins above the new floor are
  // preserved, but an override under the new fee floor snaps UP (the legacy
  // clamp's floor is 0, which would leave the fee uncollectable).
  try {
    if (offer.visibility === 'tenant_only') {
      await resetTenantPricesForChangedVariants(offerId, rebaked, new Set([variantId]));
    } else {
      await syncTenantPricesToFeeFloor(offerId, rebaked);
    }
  } catch (err) {
    console.error('[NEXUS-FEE] Tenant price re-sync failed:', err);
  }

  return { ok: true, offer: result };
}
