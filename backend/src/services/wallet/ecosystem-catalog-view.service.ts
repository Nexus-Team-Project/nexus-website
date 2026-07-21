/**
 * Wallet "Nexus catalog" view - every ecosystem-visible active offer at its
 * DEFAULT (base) pricing, exactly as a non-member would see it.
 *
 * Unlike the tenant member catalog (getMemberCatalogView) this view:
 *   - applies NO per-tenant price overrides (each offer/variant keeps its base
 *     member_price), and
 *   - does NOT exclude offers a caller's tenant has adopted or re-priced.
 * So a member who switches to the Nexus catalog always sees the base sale price
 * plus the cashback that follows from it, "as if not a member of any tenant".
 *
 * Matching, filtering (search/category/stackable/price/tags/stock), sorting
 * (incl. cashback + Hebrew title), and pagination are owned by the
 * catalog-search module (engine + cache invisible here). This view keeps the
 * ecosystem gating context, the creator-attribution join, and the item
 * mapping: it reuses the exact member-catalog item mapper (`toItem`) with an
 * EMPTY per-tenant override context, so nexus_cost stays stripped and the full
 * item shape matches GET /api/v1/offers/:tenantId - the wallet store list +
 * offer page render both feeds with the same components.
 */
import { getMongoDb } from '../../config/mongo';
import { getTenantDomainCollections } from '../../models/domain';
import { searchCatalog } from '../catalog-search';
import { toItem, type CatalogQuery, type CatalogPage } from '../catalog.service';

/**
 * Returns one page of the whole ecosystem catalog at base (default) pricing.
 *
 * Honors the same search / category / offer-type / price / stackable / tag /
 * stock / sort filters as the member catalog (approval + adoption filters are
 * admin concepts and are ignored here). Offers are gated to visibility
 * 'ecosystem' + status 'active' + a currently-open validity window (enforced
 * inside the catalog-search module's context gates).
 *
 * @param query - the shared catalog list query (page, limit, filters, sort)
 * @returns the page of default-priced CatalogItems + the total match count
 */
export async function getEcosystemCatalogView(query: CatalogQuery): Promise<CatalogPage> {
  const db = await getMongoDb();

  const { offers, total } = await searchCatalog({ context: { kind: 'ecosystem' }, query });

  // Uploader identity: batch-fetch the creating tenants for this page in ONE
  // query (no N+1), mirroring getMemberCatalogView, so cards can show the real
  // "created by <org>" name + logo instead of the NEXUS fallback.
  const uploaderTenantIds = [...new Set(offers.map((o) => o.createdByTenantId).filter(Boolean))];
  const uploaderTenants = uploaderTenantIds.length === 0
    ? []
    : await getTenantDomainCollections(db).domainTenants
        .find(
          { tenantId: { $in: uploaderTenantIds } },
          { projection: { tenantId: 1, organizationName: 1, logoUrl: 1, brandColor: 1, logoCrop: 1, coverImages: 1 } },
        )
        .toArray();
  const uploaderMap = new Map(uploaderTenants.map((tn) => [tn.tenantId, tn]));

  // No TenantOfferConfig is joined: the empty override context makes toItem
  // resolve base member_price + base variant prices and keep nexus_cost hidden.
  const items = offers.map((o) =>
    toItem(o, undefined, {
      isOwnOffer: false,
      isPlatformAdmin: false,
      canSeeNexusCost: false,
      effectiveMemberPrice: o.member_price,
      uploaderTenant: uploaderMap.get(o.createdByTenantId) ?? undefined,
    }),
  );

  return { items, total };
}
