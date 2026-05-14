/**
 * Catalog Service - read-only projection of the platform supply.
 *
 * Resolves what offers a tenant has adopted and what members can see.
 * Never writes to NexusOffer directly.
 *
 * Build-mode pricing rule: member_price = nexus_price (markup layer not yet implemented).
 * raw_cost is never included in any public-facing object returned by this service.
 *
 * Exports:
 *   getTenantCatalogView  - all visible offers with per-tenant adoption status (admin use)
 *   getMemberCatalogView  - only adopted offers for a tenant's members
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

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/**
 * Shape returned to any caller of this service.
 * Intentionally omits raw_cost - it must never leave the backend.
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
  /** Nexus platform price in ILS (smallest unit: agora). */
  nexus_price: number;
  /** Optional retail market price for display purposes. */
  market_price?: number;
  /**
   * The price a member pays. In build mode this equals nexus_price.
   * A future markup layer will derive this from TenantCatalogPolicy.
   */
  member_price: number;
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
 * Input:
 *   offer  - the NexusOffer document from MongoDB.
 *   config - the matching TenantOfferConfig for this tenant, or undefined when
 *            the tenant has never interacted with this offer.
 *
 * Output: CatalogItem with resolved adoption state and member_price.
 *
 * Security: raw_cost is never read or forwarded from this function.
 */
function toItem(offer: NexusOffer, config: TenantOfferConfig | undefined): CatalogItem {
  return {
    offerId: offer.offerId,
    title: offer.title,
    description: offer.description,
    imageUrl: offer.imageUrl,
    category: offer.category,
    nexus_price: offer.nexus_price,
    market_price: offer.market_price,
    // Build mode: member pays the same as nexus_price.
    member_price: offer.nexus_price,
    isAdopted: config?.adoptionStatus === 'active',
    adoptedAt: config?.adoptedAt,
    createdByTenantId: offer.createdByTenantId,
    executionType: offer.executionType ?? 'voucher',
    stockLimit: offer.stockLimit ?? null,
    // stockAvailable is null for unlimited offers; otherwise remaining units.
    stockAvailable: offer.stockLimit === null
      ? null
      : Math.max(0, offer.stockLimit - (offer.stockUsed ?? 0)),
    // isSoldOut is only true when a cap exists and has been fully consumed.
    isSoldOut: offer.stockLimit !== null
      && (offer.stockUsed ?? 0) >= offer.stockLimit,
    implementationLink: offer.implementationLink ?? null,
    implementationInstructions: offer.implementationInstructions ?? '',
    validUntil: offer.validUntil ?? null,
    terms: offer.terms ?? '',
    tags: offer.tags ?? [],
  };
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

/**
 * Returns all platform offers visible to a tenant, together with their
 * per-tenant adoption status.
 *
 * Visibility rules:
 *   - ecosystem  : visible to every tenant.
 *   - tenant_only: visible only to the specific invitedByTenantId.
 *
 * Used by: GET /api/v1/offers/platform (admin Benefits & Partnerships page).
 *
 * Input:
 *   tenantId - the requesting tenant's Mongo string id.
 *   category - optional filter; pass "all" or omit to return all categories.
 *
 * Output: CatalogItem[] sorted newest-first, with isAdopted reflecting this
 *         tenant's current adoption state.
 */
export async function getTenantCatalogView(
  tenantId: string,
  category?: string,
): Promise<CatalogItem[]> {
  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  const offerFilter: Record<string, unknown> = {
    status: 'active',
    $or: [
      { visibility: 'ecosystem' },
      { visibility: 'tenant_only', invitedByTenantId: tenantId },
    ],
  };
  if (category && category !== 'all') {
    offerFilter['category'] = category;
  }

  // Fetch offers and this tenant's configs in parallel for efficiency.
  const [offers, configs] = await Promise.all([
    nexusOffers.find(offerFilter).sort({ createdAt: -1 }).toArray(),
    tenantOfferConfigs.find({ tenantId }).toArray(),
  ]);

  const configMap = new Map<string, TenantOfferConfig>(
    configs.map((c) => [c.offerId, c]),
  );

  return offers.map((o) => toItem(o, configMap.get(o.offerId)));
}

/**
 * Returns only the offers a tenant has actively adopted, for rendering the
 * member-facing benefits catalog.
 *
 * Only offers with adoptionStatus = 'active' are included; 'excluded' configs
 * and offers never adopted by this tenant are filtered out.
 *
 * Used by: GET /api/v1/offers/:tenantId (member catalog page).
 *
 * Input:
 *   tenantId - the tenant whose adopted catalog should be returned.
 *   category - optional category filter; pass "all" or omit to return all.
 *
 * Output: CatalogItem[] of adopted active offers sorted newest-first.
 *         Returns an empty array if the tenant has adopted nothing yet.
 */
export async function getMemberCatalogView(
  tenantId: string,
  category?: string,
): Promise<CatalogItem[]> {
  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  // First fetch active adoptions; bail early to avoid a needless offer query.
  const adoptedConfigs = await tenantOfferConfigs
    .find({ tenantId, adoptionStatus: 'active' })
    .toArray();

  if (adoptedConfigs.length === 0) return [];

  const offerFilter: Record<string, unknown> = {
    offerId: { $in: adoptedConfigs.map((c) => c.offerId) },
    status: 'active',
    // Exclude offers that have hit their stock cap.
    // Unlimited offers (stockLimit: null) always pass this guard.
    $and: [
      {
        $or: [
          { stockLimit: null },
          { $expr: { $lt: ['$stockUsed', '$stockLimit'] } },
        ],
      },
    ],
  };
  if (category && category !== 'all') {
    offerFilter['category'] = category;
  }

  const offers = await nexusOffers.find(offerFilter).sort({ createdAt: -1 }).toArray();
  const configMap = new Map<string, TenantOfferConfig>(
    adoptedConfigs.map((c) => [c.offerId, c]),
  );

  return offers.map((o) => toItem(o, configMap.get(o.offerId)));
}

// ---------------------------------------------------------------------------
// Write functions
// ---------------------------------------------------------------------------

/**
 * Adopts a platform offer for a tenant.
 *
 * Uses an upsert so that:
 *   - A first-time adoption creates a new TenantOfferConfig document.
 *   - Re-adopting a previously excluded offer re-activates it without
 *     creating a duplicate document or losing the original adoptedAt timestamp.
 *
 * Authorization is enforced upstream (the route must verify
 * catalog:adopt permission before calling this function).
 *
 * Used by: POST /api/v1/offers/:offerId/adopt.
 *
 * Input:
 *   tenantId   - the tenant adopting the offer.
 *   offerId    - the UUID of the offer to adopt.
 *   identityId - NexusIdentity id of the admin taking the action (for audit).
 *
 * Output: void on success.
 * Throws: Error with .status = 404 if the offer does not exist or is not
 *         visible to this tenant (ecosystem or explicitly invited).
 */
export async function adoptOffer(
  tenantId: string,
  offerId: string,
  identityId: string,
): Promise<void> {
  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  // Verify the offer exists and is accessible to this tenant before writing.
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
      // $setOnInsert preserves the original adoption metadata on re-activate.
      $setOnInsert: {
        configId: randomUUID(),
        tenantId,
        offerId,
        adoptedByIdentityId: identityId,
        adoptedAt: now,
      },
      // $set ensures re-adoption flips the status regardless of previous state.
      $set: { adoptionStatus: 'active' },
    },
    { upsert: true },
  );
}

/**
 * Removes an offer from a tenant's member-facing catalog.
 *
 * Sets adoptionStatus to 'excluded' rather than deleting the document so that
 * the audit trail (original adoptedAt, adoptedByIdentityId) is preserved.
 * The offer can be re-adopted later via adoptOffer.
 *
 * Authorization is enforced upstream (route must verify catalog:adopt permission).
 *
 * Used by: DELETE /api/v1/offers/:offerId/adopt.
 *
 * Input:
 *   tenantId - the tenant removing the offer.
 *   offerId  - the UUID of the offer to exclude.
 *
 * Output: void. No-op when the tenant never adopted this offer.
 */
export async function excludeOffer(tenantId: string, offerId: string): Promise<void> {
  const db = await getMongoDb();
  const { tenantOfferConfigs } = getSupplyDomainCollections(db);

  await tenantOfferConfigs.updateOne(
    { tenantId, offerId },
    { $set: { adoptionStatus: 'excluded' } },
  );
}
