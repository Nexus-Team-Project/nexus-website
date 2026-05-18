/**
 * Catalog Service - read-only projection of the platform supply, with
 * server-side pagination + filtering.
 *
 * Owns the queries that back GET /api/v1/offers/platform (admin) and
 * GET /api/v1/offers/:tenantId (member). Both endpoints accept a CatalogQuery
 * and return a CatalogPage; client-side filtering of the full list is no
 * longer supported because the catalog can grow into the tens of thousands.
 *
 * Security note: nexus_cost is a sensitive pricing field that must NEVER be
 * exposed to adopting tenants or members. It is only included in CatalogItem
 * when the requesting tenant is the offer creator, or when they are a
 * platform admin.
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
  type NexusOffer,
  type TenantOfferConfig,
} from '../models/domain/supply.models';
import { buildSearchFilter } from './catalog-query.helper';

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
  /** Absolute public image URL resolved by Cloudinary helper on upload. */
  imageUrl?: string;
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
  /** Offer expiry date. null means no expiry. */
  validUntil?: Date | null;
  /** Terms and conditions text. */
  terms?: string;
  /** Display tags set by the offer creator. */
  tags: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a NexusOffer document and an optional TenantOfferConfig into a CatalogItem.
 *
 * Security note: nexus_cost is only populated when the caller is the offer's
 * creating tenant OR a platform admin.
 *
 * Computes 'expired' at read time when validUntil is past - we never mutate
 * the underlying document, so the same offer can appear as 'active' to admins
 * paginating without an expiry filter and 'expired' once it crosses validUntil.
 */
function toItem(
  offer: NexusOffer,
  config: TenantOfferConfig | undefined,
  context: { isOwnOffer: boolean; isPlatformAdmin: boolean },
): CatalogItem {
  const now = Date.now();
  const isExpired =
    offer.status === 'active'
    && offer.validUntil != null
    && new Date(offer.validUntil).getTime() < now;
  const effectiveStatus = isExpired ? 'expired' : offer.status;

  return {
    offerId: offer.offerId,
    title: offer.title,
    description: offer.description,
    imageUrl: offer.imageUrl,
    category: offer.category,
    visibility: offer.visibility,
    market_price: offer.market_price,
    face_value: offer.face_value,
    member_price: offer.member_price,
    ...(
      (context.isOwnOffer || context.isPlatformAdmin) &&
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
    terms: offer.terms ?? '',
    tags: offer.tags ?? [],
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

  const visibilityClause = { $or: [
    { visibility: 'ecosystem' },
    { visibility: 'tenant_only', invitedByTenantId: tenantId },
  ]};
  const baseStatusClause = { $or: [
    { status: 'active' },
    { status: { $in: ['pending_approval', 'denied'] }, createdByTenantId: tenantId },
    ...(options?.isPlatformAdmin ? [{ status: 'pending_approval' }] : []),
  ]};

  const andClauses: Array<Record<string, unknown>> = [visibilityClause, baseStatusClause];

  if (query.category) andClauses.push({ category: query.category });
  const searchFilter = buildSearchFilter(query.search);
  if (searchFilter) andClauses.push(searchFilter);

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
    nexusOffers.find(offerFilter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).toArray(),
  ]);

  // Enrich just the page (not the whole adoption set) with config status.
  const pageOfferIds = offers.map((o) => o.offerId);
  const configs = pageOfferIds.length === 0
    ? []
    : await tenantOfferConfigs.find({ tenantId, offerId: { $in: pageOfferIds } }).toArray();
  const configMap = new Map<string, TenantOfferConfig>(configs.map((c) => [c.offerId, c]));

  const items = offers.map((o) => toItem(o, configMap.get(o.offerId), {
    isOwnOffer: o.createdByTenantId === tenantId,
    isPlatformAdmin: options?.isPlatformAdmin ?? false,
  }));

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
    { $or: [{ validFrom: null }, { validFrom: { $exists: false } }, { validFrom: { $lte: nowDate } }] },
    { $or: [{ validUntil: null }, { validUntil: { $exists: false } }, { validUntil: { $gte: nowDate } }] },
    { $or: [{ stockLimit: null }, { $expr: { $lt: ['$stockUsed', '$stockLimit'] } }] },
  ];

  if (query.category) andClauses.push({ category: query.category });
  const searchFilter = buildSearchFilter(query.search);
  if (searchFilter) andClauses.push(searchFilter);

  const offerFilter = { $and: andClauses };
  const skip = (query.page - 1) * query.limit;

  const [total, offers] = await Promise.all([
    nexusOffers.countDocuments(offerFilter),
    nexusOffers.find(offerFilter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).toArray(),
  ]);

  const configMap = new Map<string, TenantOfferConfig>(
    adoptedConfigs.map((c) => [c.offerId, c]),
  );
  const items = offers.map((o) =>
    toItem(o, configMap.get(o.offerId), { isOwnOffer: false, isPlatformAdmin: false }),
  );

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
      $set: { adoptionStatus: 'active' },
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
