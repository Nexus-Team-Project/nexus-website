/**
 * MongoDB schemas and TypeScript interfaces for NEXUS supply layer.
 * Build-mode: one Offer per product (no separate Variant documents yet).
 * Pricing has three levels for voucher offers:
 *   face_value  - the voucher face value shown to members.
 *   nexus_cost  - what the supplier charges Nexus (stored server-side only, never exposed to adopting tenants).
 *   member_price - what end customers pay (must satisfy nexus_cost <= member_price <= face_value).
 * Voucher ecosystem offers enter pending_approval and require platform admin approval before going live.
 *
 * Spec alignment (NEXUS_Data_Model_v9_3, Layer 3 - Catalog):
 *   The spec splits Offer + OfferVersion + Variant + VariantVersion + VariantExecutionConfig.
 *   We keep one document per offer for build-mode (no version split yet), but persist the
 *   spec-required attributes so future structural splits become a mechanical migration.
 *
 *   - valueType        -> spec Offer.value_type. Auto-derived from executionType.
 *   - financialModel   -> spec Offer.financial_model (L1/L2/L3). Inherited from provider.
 *   - variantType      -> spec VariantVersion.variant_type (fixed/flexible/subscription/bundle).
 *   - currency         -> spec VariantVersion.currency (ISO 4217). Locked at transaction time.
 *   - validFrom        -> spec OfferVersion.valid_from. Pairs with existing validUntil.
 *   - statusReason     -> spec Offer.status_reason. Required for disabled/archived transitions.
 *   - statusChangedAt  -> spec Offer.status_changed_at. Stamped automatically on status change.
 *
 *   "expired" is derived at read time when validUntil < now() rather than stored, so the
 *   document does not need a cron sweeper to keep status in sync.
 *
 *   - TenantOfferConfig now carries an optional per-tenant voucher memberPrice
 *     and a denormalized displayPrice used by catalog sort/filter.
 */
import type { Db } from 'mongodb';
import { z } from 'zod';
import { DOMAIN_COLLECTIONS } from './collections';

/**
 * Lifecycle states an offer document can occupy.
 *   draft            - not yet published (reserved; not used by current UX).
 *   active           - visible/usable when adopted.
 *   inactive         - removed from catalogs but transaction history preserved.
 *   pending_approval - voucher ecosystem offer awaiting platform admin review.
 *   denied           - platform admin rejected the offer; supplier can edit and resubmit.
 *   disabled         - manually disabled by admin; requires statusReason.
 *   expired          - validUntil has passed; computed at read time, also persisted on transition.
 *   archived         - hidden from all admin lists; requires statusReason. Terminal-ish.
 */
export const OFFER_STATUSES = [
  'draft',
  'active',
  'inactive',
  'pending_approval',
  'denied',
  'disabled',
  'expired',
  'archived',
] as const;

/**
 * Offer statuses that require a non-empty statusReason to transition into.
 * Used by services and route handlers to enforce the spec rule for
 * disabled/archived states.
 */
export const STATUS_TRANSITIONS_REQUIRING_REASON = ['disabled', 'archived'] as const;

export const OFFER_CATEGORIES = [
  'food_beverage', 'fashion', 'health_wellness', 'entertainment',
  'travel', 'technology', 'education', 'financial', 'home_living', 'other',
] as const;
export const OFFER_ADOPTION_STATUSES = ['active', 'excluded'] as const;
export const OFFER_VISIBILITY = ['ecosystem', 'tenant_only'] as const;

/**
 * How the offer is delivered/redeemed by the member.
 * voucher   - single-use code sent to member.
 * coupon    - discount code applied at checkout.
 * gift_card - prepaid card balance.
 * product   - physical or digital product shipped/delivered.
 * service   - appointment or service booking.
 */
export const OFFER_EXECUTION_TYPES = [
  'voucher',
  'coupon',
  'gift_card',
  'product',
  'service',
] as const;

/**
 * Spec Offer.value_type values - what KIND of value the offer carries.
 * Distinct from executionType (how it is delivered).
 */
export const OFFER_VALUE_TYPES = [
  'product',
  'service',
  'monetary_value',
  'discount',
  'entitlement',
  'access',
] as const;

/**
 * Spec VariantVersion.variant_type - pricing/structure of the offer.
 * Only 'fixed' is exposed in the v1 UI; the other values are reserved so
 * documents stay valid when flexible/subscription/bundle UX is added later.
 */
export const OFFER_VARIANT_TYPES = ['fixed', 'flexible', 'subscription', 'bundle'] as const;

/**
 * Spec Offer.financial_model - inherited from the supplying Provider.
 *   L1 - direct cost passthrough.
 *   L2 - cost + margin.
 *   L3 - revenue share.
 * Default 'L1' for v1 since we have no Provider entity yet.
 */
export const OFFER_FINANCIAL_MODELS = ['L1', 'L2', 'L3'] as const;

/**
 * Units a voucher validity duration can be expressed in.
 * A voucher's expiry is a redemption window that starts when a customer BUYS
 * the voucher (not an absolute calendar date), so it is stored as an
 * amount + unit pair (e.g. 2 + 'years'). Only used when executionType === 'voucher'.
 */
export const VOUCHER_VALIDITY_UNITS = ['days', 'months', 'years'] as const;

/**
 * Sensible per-unit upper bounds for a voucher validity amount. Prevents
 * absurd values (e.g. 999999 years) from being persisted. Enforced in the
 * offers route handlers; kept here so the model and route agree on one source.
 */
export const VOUCHER_VALIDITY_MAX: Record<OfferVoucherValidityUnit, number> = {
  days: 3650,
  months: 120,
  years: 10,
};

/**
 * Maximum number of images allowed per offer.
 * Enforced in supply.service.createOffer / updateOffer and in routes (multer cap).
 * Keep this in sync with `OFFER_IMAGES_MAX` in the dashboard (`OfferImageGallery`).
 */
export const OFFER_IMAGES_MAX = 6;

export type OfferStatus = typeof OFFER_STATUSES[number];
export type OfferCategory = typeof OFFER_CATEGORIES[number];
export type OfferAdoptionStatus = typeof OFFER_ADOPTION_STATUSES[number];
export type OfferVisibility = typeof OFFER_VISIBILITY[number];
export type OfferExecutionType = typeof OFFER_EXECUTION_TYPES[number];
export type OfferValueType = typeof OFFER_VALUE_TYPES[number];
export type OfferVariantType = typeof OFFER_VARIANT_TYPES[number];
export type OfferFinancialModel = typeof OFFER_FINANCIAL_MODELS[number];
export type OfferVoucherValidityUnit = typeof VOUCHER_VALIDITY_UNITS[number];

/**
 * Maps the friendly executionType used by the UI to the spec's value_type enum.
 * Used by supply.service when creating/updating offers so we do not require the
 * client to set both fields (valueType is store-only in v1).
 *
 * Input:  executionType - friendly delivery mechanism from the form.
 * Output: matching spec value_type. Falls back to 'monetary_value' for safety
 *         on unknown inputs (defensive; current enum is exhaustive).
 */
export function deriveValueTypeFromExecutionType(
  executionType: OfferExecutionType,
): OfferValueType {
  switch (executionType) {
    case 'voucher':
    case 'gift_card':
      return 'monetary_value';
    case 'coupon':
      return 'discount';
    case 'product':
      return 'product';
    case 'service':
      return 'service';
    default:
      return 'monetary_value';
  }
}

/**
 * Platform-level catalog item created by tenant admins or supply managers.
 * market_price is an optional display reference shown to members.
 */
export const nexusOfferSchema = z.object({
  offerId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(10000).default(''),
  /**
   * Legacy single cover image URL. Kept for backward compatibility with existing
   * read sites; new code should prefer `imageUrls[0]`. Always written as
   * `imageUrls[0] ?? null` whenever the document is saved.
   */
  imageUrl: z.string().url().optional(),
  /**
   * Ordered gallery of public image URLs. Index 0 is the cover used by catalog
   * thumbnails. Limited to `OFFER_IMAGES_MAX` entries (6 in v1). Empty/missing
   * means the offer falls back to the default placeholder URL.
   */
  imageUrls: z.array(z.string().url()).max(OFFER_IMAGES_MAX).default([]).optional(),
  category: z.enum(OFFER_CATEGORIES),
  market_price: z.number().positive().optional(),
  /**
   * Denormalized price used for member-facing range filtering and sort.
   * Vouchers: equals member_price. Others: market_price ?? member_price.
   * Recomputed on every write that touches member_price, market_price, or
   * executionType. Backfilled once for existing docs via
   * `scripts/backfill-display-price.ts`.
   */
  displayPrice: z.number().nonnegative().optional(),
  /** Voucher face value (e.g. ₪100). Only applicable when executionType === 'voucher'. */
  face_value: z.number().positive().optional(),
  /** What the supplier charges Nexus. Stored only - never returned to adopting tenants or members. */
  nexus_cost: z.number().positive().optional(),
  /** What end customers pay. Must satisfy: nexus_cost <= member_price <= face_value. */
  member_price: z.number().positive().optional(),
  /** Reason provided by platform admin when denying a voucher offer. Cleared on resubmit. */
  denial_reason: z.string().max(1000).optional(),
  status: z.enum(OFFER_STATUSES).default('active'),
  visibility: z.enum(OFFER_VISIBILITY).default('ecosystem'),
  /** How the offer is fulfilled/redeemed. Defaults to voucher. */
  executionType: z.enum(OFFER_EXECUTION_TYPES).default('voucher'),
  /**
   * Spec Offer.value_type. Auto-derived from executionType by supply.service.
   * Stored so future Catalog/Eligibility services can read it directly without
   * recomputing from executionType.
   */
  valueType: z.enum(OFFER_VALUE_TYPES).default('monetary_value'),
  /**
   * Spec Offer.financial_model. Provider inheritance lands in Phase 6;
   * defaults to L1 so existing build-mode catalog math continues to work.
   */
  financialModel: z.enum(OFFER_FINANCIAL_MODELS).default('L1'),
  /**
   * Spec VariantVersion.variant_type. Only 'fixed' is exposed in v1 UI;
   * the field is here so the document is forward-compatible with flexible
   * loads, subscriptions, and bundles when that UX lands.
   */
  variantType: z.enum(OFFER_VARIANT_TYPES).default('fixed'),
  /**
   * Spec VariantVersion.currency (ISO 4217 three-letter code). Defaults to ILS.
   * Stored so transactions can lock the currency at creation time once Phase 8 ships.
   */
  currency: z.string().length(3).default('ILS'),
  /** Maximum number of units available across all tenants. null = unlimited. */
  stockLimit: z.number().int().positive().nullable().default(null),
  /** Running count of units that have been purchased/redeemed. */
  stockUsed: z.number().int().nonnegative().default(0),
  /** Direct URL where the offer can be redeemed. */
  implementationLink: z.string().url().nullable().optional(),
  /** Human-readable redemption instructions. */
  implementationInstructions: z.string().max(1000).optional().default(''),
  /**
   * Spec OfferVersion.valid_from - the offer is hidden from member catalogs
   * until this date. null means the offer is live as soon as it is approved.
   */
  validFrom: z.date().nullable().optional(),
  /** Offer expiry date. null means no expiry. Vouchers do not use this (they
   *  carry voucherValidityValue/Unit instead, applied at purchase time). */
  validUntil: z.date().nullable().optional(),
  /**
   * Voucher redemption window, measured from the moment a customer PURCHASES
   * the voucher. amount (positive int) + unit ('days'|'months'|'years').
   * Both null/absent = the voucher never expires. Only meaningful when
   * executionType === 'voucher'; nulled for every other offer type.
   * The actual per-purchase expiry date is computed later by the
   * wallet/checkout phase; here we only persist the supplier's intent.
   */
  voucherValidityValue: z.number().int().positive().nullable().optional(),
  voucherValidityUnit: z.enum(VOUCHER_VALIDITY_UNITS).nullable().optional(),
  /** Terms and conditions text. */
  terms: z.string().max(2000).optional().default(''),
  /** Display tags set by the offer creator (max 10, each max 50 chars). */
  tags: z.array(z.string().max(50)).max(10).default([]),
  /**
   * Spec Offer.status_reason. Required when the status transitions to
   * 'disabled' or 'archived'; ignored for other states. Cleared on transition
   * back to 'active'.
   */
  statusReason: z.string().max(1000).nullable().optional(),
  /**
   * Spec Offer.status_changed_at. Stamped automatically by supply.service
   * whenever status changes. Useful for audit, "expired since" displays,
   * and future timeout-based workflows.
   */
  statusChangedAt: z.date().nullable().optional(),
  createdByTenantId: z.string().min(1),
  createdByIdentityId: z.string().min(1),
  invitedByTenantId: z.string().min(1).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NexusOffer = z.infer<typeof nexusOfferSchema>;

/**
 * Records that a tenant adopted a platform offer for their members.
 * adoptionStatus = active means visible to that tenant's members.
 */
export const tenantOfferConfigSchema = z.object({
  configId: z.string().min(1),
  tenantId: z.string().min(1),
  offerId: z.string().min(1),
  adoptionStatus: z.enum(OFFER_ADOPTION_STATUSES).default('active'),
  adoptedAt: z.date(),
  adoptedByIdentityId: z.string().min(1),
  /**
   * Per-tenant voucher member price. Bounded by [offer.nexus_cost, offer.face_value].
   * Optional: when undefined, members see offer.member_price as a fallback.
   */
  memberPrice: z.number().positive().optional(),
  /**
   * Denormalized effective display price for catalog server-side sort + filter.
   * Mirrors NexusOffer.displayPrice but scoped to this specific tenant.
   */
  displayPrice: z.number().positive().optional(),
});

export type TenantOfferConfig = z.infer<typeof tenantOfferConfigSchema>;

/**
 * Returns typed MongoDB collection accessors for supply data.
 * Input: connected MongoDB Db instance.
 * Output: { nexusOffers, tenantOfferConfigs } collections.
 */
export function getSupplyDomainCollections(db: Db) {
  return {
    nexusOffers: db.collection<NexusOffer>(DOMAIN_COLLECTIONS.nexusOffers),
    tenantOfferConfigs: db.collection<TenantOfferConfig>(DOMAIN_COLLECTIONS.tenantOfferConfigs),
  };
}
