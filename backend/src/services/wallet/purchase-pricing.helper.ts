/**
 * Server-side price + eligibility resolution for a wallet voucher purchase.
 *
 * THE INVARIANT: the charged price must equal the price the wallet DISPLAYED.
 * The wallet has two feeds and this helper mirrors their pricing exactly:
 * - Tenant context (member catalog): offer must be ADOPTED by the tenant
 *   (active TenantOfferConfig); an adopter's per-variant override
 *   (variantPrices[variantId]) wins over the variant's base member_price -
 *   EXCEPT for the creating tenant's own offer, which always shows base
 *   (mirrors catalog.service.getTenantCatalogView / toItem).
 * - Null tenant (Nexus/ecosystem catalog): ecosystem-active offers at base
 *   member_price, no overrides (mirrors getEcosystemCatalogView).
 *
 * Access gate reuses resolveMemberCatalogAccess (membership + active catalog)
 * for the tenant path; the ecosystem path only requires authentication.
 *
 * Prices are stored in SHEKELS on offers; the returned priceAgorot is the
 * integer agorot amount PayMe expects (x100).
 *
 * Throws stable-coded Errors: offer_not_found | variant_not_found |
 * not_purchasable | no_catalog_access.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { NOT_DELETED } from '../../models/domain/supply.models';
import { resolveMemberCatalogAccess } from '../catalog-member-gate.service';

export interface ResolvedPurchaseOffer {
  /** Tenant context used for pricing; null = ecosystem/default pricing. */
  tenantId: string | null;
  offerTitle: string;
  variantTitle: string;
  priceAgorot: number;
  currency: 'ILS';
  createdByTenantId: string;
}

interface OfferDoc {
  offerId: string;
  title: string;
  executionType?: string;
  status: string;
  visibility: string;
  createdByTenantId: string;
  validFrom?: Date | null;
  validUntil?: Date | null;
  variants?: Array<{ variantId: string; face_value?: number; member_price?: number }>;
}

/** Converts a shekel amount to integer agorot (90.5 -> 9050). */
function toAgorot(shekels: number): number {
  return Math.round(shekels * 100);
}

export async function resolvePurchaseOffer(
  db: Db,
  args: { identityId: string; offerId: string; variantId: string; tenantId: string | null },
): Promise<ResolvedPurchaseOffer> {
  const offer = await db
    .collection<OfferDoc>(DOMAIN_COLLECTIONS.nexusOffers)
    .findOne({ offerId: args.offerId, ...NOT_DELETED });
  if (!offer) throw new Error('offer_not_found');

  const variant = offer.variants?.find((v) => v.variantId === args.variantId);
  if (!variant) throw new Error('variant_not_found');

  // Purchasable = active voucher offer within its validity window.
  const now = Date.now();
  const purchasable =
    (offer.executionType ?? 'voucher') === 'voucher'
    && offer.status === 'active'
    && (!offer.validFrom || new Date(offer.validFrom).getTime() <= now)
    && (!offer.validUntil || new Date(offer.validUntil).getTime() >= now);
  if (!purchasable) throw new Error('not_purchasable');

  let priceShekels: number | undefined;

  if (args.tenantId) {
    // Member catalog path: membership + active catalog + adoption required.
    const access = await resolveMemberCatalogAccess(db, {
      tenantId: args.tenantId,
      nexusIdentityId: args.identityId,
      hasCatalogViewPermission: false,
    });
    if (access !== 'allowed') throw new Error('no_catalog_access');

    const toc = await db.collection(DOMAIN_COLLECTIONS.tenantOfferConfigs).findOne(
      { tenantId: args.tenantId, offerId: args.offerId, adoptionStatus: 'active' },
      { projection: { variantPrices: 1 } },
    );
    if (!toc) throw new Error('not_purchasable');

    // Owner's own offer always sells at base; adopters get their override.
    const isOwnOffer = offer.createdByTenantId === args.tenantId;
    const override = isOwnOffer
      ? undefined
      : (toc.variantPrices as Record<string, number> | undefined)?.[args.variantId];
    priceShekels = override ?? variant.member_price;
  } else {
    // Nexus/ecosystem catalog path: ecosystem-active at base price.
    if (offer.visibility !== 'ecosystem') throw new Error('not_purchasable');
    priceShekels = variant.member_price;
  }

  if (priceShekels === undefined || priceShekels <= 0) throw new Error('not_purchasable');

  return {
    tenantId: args.tenantId,
    offerTitle: offer.title,
    variantTitle: variant.face_value !== undefined ? `₪${variant.face_value}` : args.variantId,
    priceAgorot: toAgorot(priceShekels),
    currency: 'ILS',
    createdByTenantId: offer.createdByTenantId,
  };
}
