/**
 * Catalog Service - read-only projection of the platform supply, with
 * server-side pagination + filtering.
 *
 * Owns the queries that back GET /api/v1/offers/platform (admin) and
 * GET /api/v1/offers/:tenantId (member). Both endpoints accept a CatalogQuery
 * and return a CatalogPage; client-side filtering of the full list is no
 * longer supported because the catalog can grow into the tens of thousands.
 *
 * Security note: nexus_cost is only exposed to the offer creator OR to a
 * tenant whose TenantOfferConfig.adoptionStatus === 'active' for that
 * offer. Members never see it.
 *
 * Exports:
 *   getTenantCatalogView  - paginated admin/supply-manager catalog
 *   getMemberCatalogView  - paginated member-facing catalog (adopted offers)
 *   adoptOffer            - mark an offer as active for a tenant
 *   excludeOffer          - remove an offer from a tenant's catalog
 */

import { randomUUID } from 'node:crypto';
import { getMongoDb } from '../config/mongo';
import {
  getSupplyDomainCollections,
  NOT_DELETED,
  type NexusOffer,
  type TenantOfferConfig,
  type ImageCropEntry,
} from '../models/domain/supply.models';
import { buildSearchFilter, buildFilterClauses, buildSortMap } from './catalog-query.helper';
import { computeTenantDisplayPrice } from './supply-price.helper';

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/**
 * Server-side filter + paging input shared by both catalog endpoints.
 * Empty/undefined filter fields mean "no constraint".
 *
 * Member view ignores approvalStatus and adoptionStatus (their access is
 * narrower); admin view honors all fields.
 */
export interface CatalogQuery {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  approvalStatus?: 'active' | 'pending_approval' | 'denied' | 'expired';
  adoptionStatus?: 'adopted' | 'not_adopted';
  /**
   * When true, return ONLY offers this tenant created (createdByTenantId ===
   * tenantId), in any status/visibility - not offers adopted from the ecosystem.
   * Used by the Product Catalog page (a tenant's own uploaded offers).
   */
  ownedOnly?: boolean;

  /** ANY-of match against NexusOffer.executionType. Empty array = no filter. */
  offerTypes?: string[];
  /** Inclusive lower bound against denormalized displayPrice. */
  priceMin?: number;
  /** Inclusive upper bound against denormalized displayPrice. */
  priceMax?: number;
  /** Offer.validFrom >= this date. */
  validFromAfter?: Date;
  /** Offer.validUntil <= this date. */
  validUntilBefore?: Date;
  /** ANY-of match against NexusOffer.tags (multikey index). */
  tags?: string[];
  /** Hide sold-out offers (stockUsed >= stockLimit). */
  inStockOnly?: boolean;
  /** Sort mode. Default 'newest' (createdAt desc). */
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'expiry_soon' | 'expiry_far';
}

/** Page result returned by both catalog views. Total drives UI page count. */
export interface CatalogPage {
  items: CatalogItem[];
  total: number;
}

/**
 * Shape returned to any caller of this service.
 * Fields marked as "creating tenant + platform admin only" are omitted for all other callers.
 */
export interface CatalogItem {
  /** Stable UUID that identifies the offer across the platform. */
  offerId: string;
  title: string;
  description: string;
  /** Legacy single cover image URL. Equals `imageUrls[0]` when a gallery exists. */
  imageUrl?: string;
  /** Ordered gallery of public image URLs. Index 0 is the cover. */
  imageUrls?: string[];
  /**
   * Per-image crop metadata keyed by original URL. The URLs above point at the
   * pristine originals; clients apply the crop at display time (Cloudinary
   * transform URLs). Missing entry / crop=null = show the whole image.
   */
  imageCrops?: ImageCropEntry[];
  /** Top-level offer category (e.g. "health", "food"). */
  category: string;
  /**
   * 'ecosystem' (visible to every tenant) or 'tenant_only' (visible only to
   * the creating tenant). Already public information by the time a caller
   * sees the offer at all - exposed so the admin table can display it.
   */
  visibility: string;
  /** Optional retail market price for display purposes. */
  market_price?: number;
  /** Voucher face value (e.g. ₪100). Exposed to everyone when present. */
  face_value?: number;
  /** Price end customers pay. Exposed to everyone when present. */
  member_price?: number;
  /** Per-tenant override of voucher member price; undefined when tenant has no override. */
  tenantMemberPrice?: number;
  /** Per-tenant denormalized display price; undefined when tenant has no override. */
  tenantDisplayPrice?: number;
  /**
   * Cost the supplier charges Nexus.
   * SECURITY: only populated for the creating tenant or platform admin.
   * Must never be returned to adopting tenants or members.
   */
  nexus_cost?: number;
  /** Current lifecycle status of the offer (e.g. active, pending_approval, denied, expired). */
  approval_status?: string;
  /** Denial reason from the platform admin. Only populated for the creating tenant. */
  denial_reason?: string;
  /** True when the tenant has an active TenantOfferConfig for this offer. */
  isAdopted: boolean;
  /** Timestamp when this tenant adopted the offer, if adopted. */
  adoptedAt?: Date;
  /** TenantId of the supply manager who created the offer. */
  createdByTenantId: string;
  /** How the offer is fulfilled/redeemed (voucher, coupon, gift_card, product, service). */
  executionType: string;
  /** Maximum total units available (null = unlimited). */
  stockLimit: number | null;
  /** Units still available for purchase (null when stockLimit is null). */
  stockAvailable: number | null;
  /** True when all units have been claimed. Always false for unlimited offers. */
  isSoldOut: boolean;
  /** Direct URL where the offer can be redeemed. null when not set. */
  implementationLink?: string | null;
  /** Human-readable redemption instructions. */
  implementationInstructions?: string;
  /** Date the offer goes live. null = live immediately on approval. */
  validFrom?: Date | null;
  /** Offer expiry date. null means no expiry. Always null for vouchers. */
  validUntil?: Date | null;
  /** Voucher validity TYPE default ('limit' | 'from_until'). Voucher-only; null
   *  otherwise. The validity VALUE is per inventory unit. See voucher-validity-dating. */
  defaultValidityType?: 'limit' | 'from_until' | null;
  /** Whether the voucher may be combined with other promotions. Voucher-only; null otherwise. */
  voucherStackable?: boolean | null;
  /** Voucher card background color ("#rrggbb"). Voucher-only; null otherwise. */
  voucherBackgroundColor?: string | null;
  /** Voucher SKU / internal company code. Voucher-only; null otherwise. */
  sku?: string | null;
  /** Terms and conditions text. */
  terms?: string;
  /** Display tags set by the offer creator. */
  tags: string[];
  /** Whether redemption terms/method are shared across variants or per variant. */
  redemptionScope?: 'shared' | 'per_variant';
  /**
   * Voucher variants (priced configurations). Present only for voucher offers
   * that carry variants. Each variant's `nexus_cost` is included ONLY when the
   * caller may see it (creating tenant / platform admin / active adoption) -
   * stripped for everyone else, same rule as the offer-level nexus_cost.
   */
  variants?: CatalogVariant[];
}

/**
 * A voucher variant as exposed in the catalog. Mirrors the stored OfferVariant
 * but `nexus_cost` is present only for privileged callers (see CatalogItem.variants).
 */
export interface CatalogVariant {
  variantId: string;
  face_value?: number;
  nexus_cost?: number;
  member_price?: number;
  voucherStackable?: boolean | null;
  sku?: string | null;
  tags?: string[];
  terms?: string;
  implementationInstructions?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a NexusOffer document and an optional TenantOfferConfig into a CatalogItem.
 *
 * Security note: nexus_cost is exposed only when context.canSeeNexusCost is
 * true. Callers must compute that from: (a) caller is offer creator, OR
 * (b) caller is a platform admin, OR (c) caller's tenant has an active
 * TenantOfferConfig for this offer. Members must always pass false.
 *
 * The effectiveMemberPrice override lets the member view substitute the
 * per-tenant TenantOfferConfig.memberPrice for the global offer.member_price
 * without mutating the underlying NexusOffer.
 *
 * Computes 'expired' at read time when validUntil is past - we never mutate
 * the underlying document, so the same offer can appear as 'active' to admins
 * paginating without an expiry filter and 'expired' once it crosses validUntil.
 */
function toItem(
  offer: NexusOffer,
  config: TenantOfferConfig | undefined,
  context: {
    isOwnOffer: boolean;
    isPlatformAdmin: boolean;
    canSeeNexusCost: boolean;
    effectiveMemberPrice?: number;
    /** Per-tenant per-variant price overrides (variantId -> member price). */
    effectiveVariantPrices?: Record<string, number>;
  },
): CatalogItem {
  const now = Date.now();
  // Catalog "expired" is derived from the absolute validUntil. Vouchers never
  // set validUntil (their expiry is a per-purchase window held in
  // voucherValidityValue/Unit and applied at checkout), so a voucher is never
  // marked expired here — which is the intended behavior.
  const isExpired =
    offer.status === 'active'
    && offer.validUntil != null
    && new Date(offer.validUntil).getTime() < now;
  const effectiveStatus = isExpired ? 'expired' : offer.status;

  const resolvedMemberPrice = context.effectiveMemberPrice !== undefined
    ? context.effectiveMemberPrice
    : offer.member_price;

  return {
    offerId: offer.offerId,
    title: offer.title,
    description: offer.description,
    imageUrl: offer.imageUrl,
    imageUrls: offer.imageUrls && offer.imageUrls.length > 0
      ? offer.imageUrls
      : (offer.imageUrl ? [offer.imageUrl] : []),
    ...(offer.imageCrops && offer.imageCrops.length > 0 && { imageCrops: offer.imageCrops }),
    category: offer.category,
    visibility: offer.visibility,
    market_price: offer.market_price,
    face_value: offer.face_value,
    member_price: resolvedMemberPrice,
    ...(
      context.canSeeNexusCost &&
      offer.nexus_cost !== undefined && { nexus_cost: offer.nexus_cost }
    ),
    approval_status: effectiveStatus,
    ...(context.isOwnOffer && offer.denial_reason && { denial_reason: offer.denial_reason }),
    isAdopted: config?.adoptionStatus === 'active',
    adoptedAt: config?.adoptedAt,
    createdByTenantId: offer.createdByTenantId,
    executionType: offer.executionType ?? 'voucher',
    stockLimit: offer.stockLimit ?? null,
    stockAvailable: offer.stockLimit === null
      ? null
      : Math.max(0, offer.stockLimit - (offer.stockUsed ?? 0)),
    isSoldOut: offer.stockLimit !== null
      && (offer.stockUsed ?? 0) >= offer.stockLimit,
    implementationLink: offer.implementationLink ?? null,
    implementationInstructions: offer.implementationInstructions ?? '',
    validFrom: offer.validFrom ?? null,
    validUntil: offer.validUntil ?? null,
    defaultValidityType: offer.defaultValidityType ?? null,
    voucherStackable: offer.voucherStackable ?? null,
    voucherBackgroundColor: offer.voucherBackgroundColor ?? null,
    sku: offer.sku ?? null,
    terms: offer.terms ?? '',
    tags: offer.tags ?? [],
    ...(offer.redemptionScope && { redemptionScope: offer.redemptionScope }),
    // Variants: strip nexus_cost per variant unless the caller may see it
    // (same gate as the offer-level nexus_cost above).
    ...(offer.variants && offer.variants.length > 0 && {
      variants: offer.variants.map((v) => {
        // Per-tenant per-variant price override wins over the variant's own
        // member_price (the selling price members see for this tenant).
        const effPrice = context.effectiveVariantPrices?.[v.variantId] ?? v.member_price;
        // Redemption text is surfaced PER VARIANT so each variant is
        // self-contained: a variant's own (custom) text wins; otherwise it
        // inherits the offer's shared terms/method. Storage stays normalized
        // (inherited variants persist no terms) - this is a read-time fill only.
        const effTerms = (v.terms && v.terms.trim()) ? v.terms : (offer.terms || undefined);
        const effMethod = (v.implementationInstructions && v.implementationInstructions.trim())
          ? v.implementationInstructions
          : (offer.implementationInstructions || undefined);
        return ({
        variantId: v.variantId,
        ...(v.face_value !== undefined && { face_value: v.face_value }),
        ...(context.canSeeNexusCost && v.nexus_cost !== undefined && { nexus_cost: v.nexus_cost }),
        ...(effPrice !== undefined && { member_price: effPrice }),
        voucherStackable: v.voucherStackable ?? null,
        sku: v.sku ?? null,
        tags: v.tags ?? [],
        ...(effTerms !== undefined && { terms: effTerms }),
        ...(effMethod !== undefined && { implementationInstructions: effMethod }),
        });
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

/**
 * Returns one page of platform offers visible to a tenant, with their
 * per-tenant adoption status. Honors search, category, approval, and adoption
 * filters server-side.
 *
 * Visibility rules: ecosystem offers visible to everyone; tenant_only offers
 * visible only to the matching invitedByTenantId.
 *
 * Status rules: 'active' offers always visible. 'pending_approval' / 'denied'
 * visible to their creator and to platform admins.
 *
 * Adoption filter is evaluated by pre-fetching the tenant's adoption offerId
 * set and using $in / $nin against the offers filter. This keeps the existing
 * two-query merge pattern instead of switching to $lookup.
 */
export async function getTenantCatalogView(
  tenantId: string,
  query: CatalogQuery,
  options?: { isPlatformAdmin?: boolean },
): Promise<CatalogPage> {
  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  // ownedOnly: restrict to offers this tenant created (the Product Catalog page).
  // Otherwise scope to what is visible to the tenant (ecosystem + own tenant_only).
  const scopeClause = query.ownedOnly
    ? { createdByTenantId: tenantId }
    : { $or: [
        { visibility: 'ecosystem' },
        { visibility: 'tenant_only', invitedByTenantId: tenantId },
      ]};
  const baseStatusClause = { $or: [
    { status: 'active' },
    { status: { $in: ['pending_approval', 'denied'] }, createdByTenantId: tenantId },
    ...(options?.isPlatformAdmin ? [{ status: 'pending_approval' }] : []),
  ]};

  const andClauses: Array<Record<string, unknown>> = [scopeClause, baseStatusClause, NOT_DELETED];

  if (query.category) andClauses.push({ category: query.category });
  const searchFilter = buildSearchFilter(query.search);
  if (searchFilter) andClauses.push(searchFilter);
  andClauses.push(...buildFilterClauses(query));

  // 'expired' is computed (validUntil<now, still status=active). Other approval
  // statuses are exact matches.
  if (query.approvalStatus === 'expired') {
    andClauses.push({ status: 'active', validUntil: { $lt: new Date() } });
  } else if (query.approvalStatus) {
    andClauses.push({ status: query.approvalStatus });
  }

  // Adoption filter requires a configs pre-fetch since the adoption state lives
  // on TenantOfferConfig, not on NexusOffer.
  if (query.adoptionStatus === 'adopted') {
    const adopted = await tenantOfferConfigs
      .find({ tenantId, adoptionStatus: 'active' }, { projection: { offerId: 1 } })
      .toArray();
    const ids = adopted.map((c) => c.offerId);
    if (ids.length === 0) return { items: [], total: 0 };
    andClauses.push({ offerId: { $in: ids } });
  } else if (query.adoptionStatus === 'not_adopted') {
    const adopted = await tenantOfferConfigs
      .find({ tenantId, adoptionStatus: 'active' }, { projection: { offerId: 1 } })
      .toArray();
    const ids = adopted.map((c) => c.offerId);
    if (ids.length > 0) andClauses.push({ offerId: { $nin: ids } });
  }

  const offerFilter = { $and: andClauses };
  const skip = (query.page - 1) * query.limit;

  // Count + page query in parallel for latency.
  const [total, offers] = await Promise.all([
    nexusOffers.countDocuments(offerFilter),
    nexusOffers.find(offerFilter).sort(buildSortMap(query.sort)).skip(skip).limit(query.limit).toArray(),
  ]);

  // Enrich just the page (not the whole adoption set) with config status.
  const pageOfferIds = offers.map((o) => o.offerId);
  const configs = pageOfferIds.length === 0
    ? []
    : await tenantOfferConfigs.find({ tenantId, offerId: { $in: pageOfferIds } }).toArray();
  const configMap = new Map<string, TenantOfferConfig>(configs.map((c) => [c.offerId, c]));

  const items = offers.map((o) => {
    const toc = configMap.get(o.offerId);
    const isOwnOffer = o.createdByTenantId === tenantId;
    const isPlatformAdmin = options?.isPlatformAdmin ?? false;
    const hasActiveToc = toc?.adoptionStatus === 'active';
    const canSeeNexusCost = isOwnOffer || isPlatformAdmin || hasActiveToc;

    const base = toItem(o, toc, {
      isOwnOffer,
      isPlatformAdmin,
      canSeeNexusCost,
      ...(toc?.variantPrices && { effectiveVariantPrices: toc.variantPrices }),
    });

    return {
      ...base,
      ...(toc?.memberPrice !== undefined ? { tenantMemberPrice: toc.memberPrice } : {}),
      ...(toc?.displayPrice !== undefined ? { tenantDisplayPrice: toc.displayPrice } : {}),
    };
  });

  return { items, total };
}

/**
 * Returns one page of offers a tenant has actively adopted, for the
 * member-facing benefits catalog. Honors search + category filters only —
 * approval and adoption filters are admin concepts and not exposed to members.
 *
 * Filter gates applied (in addition to the user filters):
 *   - status must be 'active' (excludes draft / disabled / archived / denied / pending).
 *   - validFrom (when set) must already be in the past.
 *   - validUntil (when set) must still be in the future.
 *   - stock cap must not be reached.
 */
export async function getMemberCatalogView(
  tenantId: string,
  query: CatalogQuery,
): Promise<CatalogPage> {
  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  // Pre-fetch the adopted set; bail early when the tenant has adopted nothing.
  const adoptedConfigs = await tenantOfferConfigs
    .find({ tenantId, adoptionStatus: 'active' })
    .toArray();
  if (adoptedConfigs.length === 0) return { items: [], total: 0 };

  const nowDate = new Date();
  const andClauses: Array<Record<string, unknown>> = [
    { offerId: { $in: adoptedConfigs.map((c) => c.offerId) } },
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

  // Build the configMap up-front so the price-sort branch can resolve the
  // effective per-tenant displayPrice without an additional fetch.
  const configMap = new Map<string, TenantOfferConfig>(
    adoptedConfigs.map((c) => [c.offerId, c]),
  );

  // When the member sort is by price, we must rank by the EFFECTIVE price -
  // TenantOfferConfig.displayPrice when present, else NexusOffer.displayPrice.
  // Mongo cannot sort by that without a $lookup, and the project rule is to
  // preserve the two-query + JS-map join pattern. So for price sorts only,
  // fetch the full filtered set (bounded by this tenant's adopted offers,
  // already in memory), JS-sort by effective price, then paginate in memory.
  // Non-price sorts keep the cheap Mongo-side sort + skip/limit path so the
  // catalog stays fast for the common "newest" / expiry sorts.
  const isPriceSort = query.sort === 'price_asc' || query.sort === 'price_desc';

  let total: number;
  let offers: NexusOffer[];

  if (isPriceSort) {
    const all = await nexusOffers.find(offerFilter).toArray();
    total = all.length;
    const direction = query.sort === 'price_asc' ? 1 : -1;
    all.sort((a, b) => {
      const aEff = configMap.get(a.offerId)?.displayPrice ?? a.displayPrice ?? 0;
      const bEff = configMap.get(b.offerId)?.displayPrice ?? b.displayPrice ?? 0;
      if (aEff !== bEff) return (aEff - bEff) * direction;
      // Stable tie-breaker matches the Mongo-side sort: newest first.
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

  const items = offers.map((o) => {
    const toc = configMap.get(o.offerId);
    const effectiveMemberPrice = toc?.memberPrice ?? o.member_price;
    return toItem(o, toc, {
      isOwnOffer: false,
      isPlatformAdmin: false,
      canSeeNexusCost: false,
      effectiveMemberPrice,
      ...(toc?.variantPrices && { effectiveVariantPrices: toc.variantPrices }),
    });
  });

  return { items, total };
}

// ---------------------------------------------------------------------------
// Write functions
// ---------------------------------------------------------------------------

/**
 * Adopts a platform offer for a tenant. Uses upsert so re-adopting a previously
 * excluded offer reactivates it without losing the original adoption metadata.
 *
 * Authorization is enforced upstream (the route must verify catalog:adopt
 * permission before calling).
 *
 * Throws Error with .status = 404 when the offer does not exist or is not
 * visible to this tenant.
 */
export async function adoptOffer(
  tenantId: string,
  offerId: string,
  identityId: string,
): Promise<void> {
  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  const offer = await nexusOffers.findOne({
    offerId,
    status: 'active',
    ...NOT_DELETED,
    $or: [
      { visibility: 'ecosystem' },
      { visibility: 'tenant_only', invitedByTenantId: tenantId },
    ],
  });
  if (!offer) {
    throw Object.assign(
      new Error('Offer not found or not accessible to this tenant'),
      { status: 404 },
    );
  }

  // Seed per-tenant pricing on adoption. Adopting tenant starts at the
  // offer-level member_price (zero-margin baseline for vouchers since
  // createOffer defaults member_price = nexus_cost when omitted).
  // displayPrice is denormalized so the catalog server-side sort/filter
  // can resolve effective per-tenant price without an extra join lookup.
  const tocMemberPrice = offer.member_price;
  const tocDisplayPrice = computeTenantDisplayPrice(
    offer.executionType,
    tocMemberPrice,
    offer.displayPrice,
    offer.member_price,
    offer.market_price,
  );

  const now = new Date();
  await tenantOfferConfigs.updateOne(
    { tenantId, offerId },
    {
      $setOnInsert: {
        configId: randomUUID(),
        tenantId,
        offerId,
        adoptedByIdentityId: identityId,
        adoptedAt: now,
      },
      $set: {
        adoptionStatus: 'active',
        ...(tocMemberPrice !== undefined && { memberPrice: tocMemberPrice }),
        ...(tocDisplayPrice !== undefined && { displayPrice: tocDisplayPrice }),
      },
    },
    { upsert: true },
  );
}

/**
 * Removes an offer from a tenant's member-facing catalog by flipping
 * adoptionStatus to 'excluded'. Does not delete the row so audit history
 * (adoptedAt / adoptedByIdentityId) is preserved.
 */
export async function excludeOffer(tenantId: string, offerId: string): Promise<void> {
  const db = await getMongoDb();
  const { tenantOfferConfigs } = getSupplyDomainCollections(db);
  await tenantOfferConfigs.updateOne(
    { tenantId, offerId },
    { $set: { adoptionStatus: 'excluded' } },
  );
}
