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
 * It reuses the exact member-catalog item mapper (`toItem`) with an EMPTY
 * per-tenant override context, so nexus_cost stays stripped and the full item
 * shape (variants, creator attribution, crops, terms, stock) matches
 * GET /api/v1/offers/:tenantId - the wallet store list + offer page render both
 * feeds with the same components.
 */
import { getMongoDb } from '../../config/mongo';
import { getSupplyDomainCollections, NOT_DELETED, type NexusOffer } from '../../models/domain/supply.models';
import { getTenantDomainCollections } from '../../models/domain';
import { buildSearchFilter, buildFilterClauses, buildSortMap, markVoucherSoldOut } from '../catalog-query.helper';
import { toItem, type CatalogQuery, type CatalogPage } from '../catalog.service';

/**
 * Returns one page of the whole ecosystem catalog at base (default) pricing.
 *
 * Honors the same search / category / offer-type / price / tag / stock / sort
 * filters as the member catalog (approval + adoption filters are admin concepts
 * and are ignored here). Offers are gated to visibility 'ecosystem' + status
 * 'active' + a currently-open validity window.
 *
 * @param query - the shared catalog list query (page, limit, filters, sort)
 * @returns the page of default-priced CatalogItems + the total match count
 */
export async function getEcosystemCatalogView(query: CatalogQuery): Promise<CatalogPage> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  const nowDate = new Date();
  const andClauses: Array<Record<string, unknown>> = [
    { visibility: 'ecosystem' },
    { status: 'active' },
    NOT_DELETED,
    { $or: [{ validFrom: null }, { validFrom: { $exists: false } }, { validFrom: { $lte: nowDate } }] },
    { $or: [{ validUntil: null }, { validUntil: { $exists: false } }, { validUntil: { $gte: nowDate } }] },
  ];

  if (query.category) andClauses.push({ category: query.category });
  const searchFilter = buildSearchFilter(query.search);
  if (searchFilter) andClauses.push(searchFilter);
  andClauses.push(...buildFilterClauses(query));

  const offerFilter = { $and: andClauses };
  const skip = (query.page - 1) * query.limit;

  // Price sorts must rank by the offer's own displayPrice (no per-tenant
  // override exists in this view). Mongo can sort by that column directly, but
  // we keep the member view's JS-sort shape for parity + a stable newest-first
  // tie-breaker.
  const isPriceSort = query.sort === 'price_asc' || query.sort === 'price_desc';

  let total: number;
  let offers: NexusOffer[];

  if (isPriceSort) {
    const all = await nexusOffers.find(offerFilter).toArray();
    total = all.length;
    const direction = query.sort === 'price_asc' ? 1 : -1;
    all.sort((a, b) => {
      const aEff = a.displayPrice ?? 0;
      const bEff = b.displayPrice ?? 0;
      if (aEff !== bEff) return (aEff - bEff) * direction;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    offers = all.slice(skip, skip + query.limit);
  } else {
    const [count, page] = await Promise.all([
      nexusOffers.countDocuments(offerFilter),
      nexusOffers.find(offerFilter).sort(buildSortMap(query.sort)).skip(skip).limit(query.limit).toArray(),
    ]);
    total = count;
    offers = page;
  }

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

  // Real voucher stock overrides offer-level isSoldOut for store-tile badges.
  await markVoucherSoldOut(db, items);
  return { items, total };
}
