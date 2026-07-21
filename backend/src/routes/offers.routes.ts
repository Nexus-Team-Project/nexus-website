/**
 * Offers routes - HTTP handlers for all offer-related endpoints.
 *
 * Route names match openapi.json paths exactly with /v1/ prefix.
 * Static path segments (/platform, /status, /stats, /barcodes, /:offerId/approve, /:offerId/deny)
 * are registered BEFORE dynamic /:offerId patterns to prevent Express catching them as offer ids.
 *
 * Authorization: supply/catalog permissions are checked inline via
 * resolveTenantContextWithPermission rather than the requireDomainPermission
 * middleware. This is required because the middleware resolves roles with a null
 * tenantId when no :tenantId param exists in the URL, which would find no
 * tenant-scoped role assignments and incorrectly deny all users.
 *
 * Voucher approval flow:
 *   - Ecosystem voucher creation sets status = 'pending_approval' and emails platform admins.
 *   - Platform admins can POST /:offerId/approve or POST /:offerId/deny (with reason).
 *   - Denied offers transition back to 'pending_approval' when the supplier edits and saves them.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { createError } from '../middleware/errorHandler';
import { getMongoDb } from '../config/mongo';
import { prisma } from '../config/database';
import { getTenantDomainCollections } from '../models/domain';
import {
  resolveTenantContext,
  resolveTenantContextWithPermission,
} from '../utils/resolve-tenant-context';
import { createOffer, updateOffer, deleteOffer } from '../services/supply.service';
import { resolveMemberCatalogAccess } from '../services/catalog-member-gate.service';
import { setTenantVoucherPrice } from '../services/tenant-pricing.service';
import { setNexusFeePct, setVariantBaseSalePrice } from '../services/nexus-fee.service';
import { approveOffer, denyOffer } from '../services/supply-approval.service';
import {
  getTenantCatalogView,
  getTenantOfferDetail,
  getMemberCatalogView,
  adoptOffer,
  excludeOffer,
} from '../services/catalog.service';
import { autoAdoptOfferForAllTenants } from '../services/admin-offer-auto-adopt.service';
import { OFFER_CATEGORIES, OFFER_VISIBILITY, OFFER_EXECUTION_TYPES, OFFER_IMAGES_MAX, VOUCHER_VALIDITY_UNITS, VOUCHER_PAYMENTS_MIN, VOUCHER_PAYMENTS_MAX, SKU_MIN_LENGTH, SKU_MAX_LENGTH, SKU_REGEX, getSupplyDomainCollections, NOT_DELETED, imageCropSchema, imageCropEntrySchema, type OfferVariant } from '../models/domain/supply.models';
import { OFFER_REDEMPTION_SCOPES, MAX_VARIANTS_PER_OFFER, VARIANT_ID_REGEX, VALIDITY_TYPES } from '../models/domain/supply-variants.models';
import { assertVoucherValidity, assertVoucherStackable, assertUniqueVariantValueStack } from '../services/supply-voucher.helper';
import { isUploadableImageUrl, MAX_IMAGE_URL_LENGTH } from '../utils/cloudinary';
import { addBarcodes, addLinks, getInventorySummary, getOfferVariantInventoryCounts, listVariantUnits, updateUnitValidity, updateUnitsValidity, deleteUnit, type InventoryResult, type BatchValidity } from '../services/voucher-inventory.service';
import { getOfferVariantValiditySummaries } from '../services/voucher-validity-summary.service';
import type { OfferVariantInput } from '../services/supply-variants.helper';
import { createVouchersBulk, BULK_MAX_ROWS } from '../services/voucher-bulk.service';
import { VOUCHER_CODE_KINDS, VOUCHER_INVENTORY_MAX, VOUCHER_CODE_REGEX } from '../models/domain/voucher-codes.models';
import { syncDomainIdentityForLoginUser } from '../services/domain-identity.service';
import { getDomainAuthorizationContext, hasDomainPermission } from '../services/domain-authorization.service';
import {
  sendVoucherApprovalRequestEmail,
  sendVoucherApprovedEmail,
  sendVoucherDeniedEmail,
  sendVoucherWithdrawnEmail,
  sendOfferRemovedByAdminEmail,
  getConfiguredAdminEmails,
} from '../services/voucher-approval-email.service';
import { getIdentityDomainCollections } from '../models/domain/identity.models';
import { getOnboardingStatus } from '../services/onboarding.service';
import { isTenantBusinessSetupApproved } from '../services/business-setup-approval.service';
import { canTenantCreateOffer } from '../services/business-setup-approval.helper';
import { resolveCreateAttribution } from '../services/supply-on-behalf.helper';

const router = Router();

// Rate-limit all offer routes (100 req/min/IP) to blunt scraping/DoS.
router.use(apiLimiter);

/**
 * Multer upload instance configured for in-memory storage.
 * Limits file size to 5 MB to prevent abuse.
 * Files are held in memory as Buffer and forwarded to Cloudinary upload.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  // Each individual image file is capped at 5 MB. The route handler then
  // caps total per-request count at OFFER_IMAGES_MAX via `upload.array(...)`.
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Preprocessor for the multipart `keptImageUrls` field. The dashboard sends it
 * as a JSON-encoded string of URL strings. Invalid JSON falls back to null so
 * downstream Zod validation produces a clean 400 instead of a runtime crash.
 *
 * Input:  whatever value multer parsed (string for multipart, array for JSON).
 * Output: the parsed array, the original value if already an array, or null.
 */
function parseKeptImageUrlsField(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/**
 * Preprocessor for the multipart `keptImageCrops` / `newImageCrops` fields, both
 * JSON-encoded. Mirrors `parseKeptImageUrlsField`: invalid JSON falls back to
 * null so downstream Zod validation returns a clean 400 instead of crashing. A
 * non-string passes through unchanged (already-parsed JSON body).
 */
function parseImageCropsField(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

/**
 * Parses a multipart `variants` field. The dashboard sends it as a JSON-encoded
 * array of variant objects. Invalid JSON falls back to null so Zod array
 * validation produces a clean 400 instead of a crash. A non-string (already
 * parsed, e.g. JSON body) passes through unchanged.
 */
function parseVariantsField(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/**
 * Multipart `remoteImages` field: JSON-encoded [{url, crop|null}] of
 * URL-sourced gallery images. The UI exposes this for VOUCHER offers only
 * (owner decision 2026-07-16); the server accepts it for any type because
 * re-hosting yields the exact result of uploading the same file - the voucher
 * gate is a UI rollout scope, not a security boundary.
 *
 * SECURITY: each URL is http(s)-only + length-capped (rejecting javascript:/
 * data:/file: and free text) BEFORE any fetch; the fetch itself is performed
 * by Cloudinary (never this server) and only the re-hosted Cloudinary URL is
 * persisted - the user's URL string never reaches storage or an HTML sink.
 */
const remoteImagesField = z.preprocess(
  parseImageCropsField,
  z.array(z.object({
    url: z.string().max(MAX_IMAGE_URL_LENGTH).refine(
      (value) => isUploadableImageUrl(value),
      'remote image URLs must be http(s)',
    ),
    crop: imageCropSchema.nullable(),
  })).max(OFFER_IMAGES_MAX).optional(),
);

/**
 * Strict https-only URL schema for the voucher branch-list link
 * (`NexusOffer.branchListUrl`): well-formed URL AND scheme === 'https:' - a
 * plain http(s)-agnostic `.url()` (used elsewhere, e.g. implementationLink)
 * would accept http, which this field explicitly must not.
 */
const httpsUrlSchema = z.string().trim().url().refine(
  (value) => new URL(value).protocol === 'https:',
  { message: 'must be a valid https:// URL' },
);

/**
 * One voucher variant as received from a client. Numbers arrive as real numbers
 * (the array is JSON-encoded), so no coercion is needed. `variantId` is optional:
 * present preserves an existing variant on edit; absent = the service generates one.
 * Cross-field pricing/validity/stackable rules are checked per variant in the
 * handler (validateVoucherVariants), mirroring the flat-field checks.
 */
const variantInputSchema = z.object({
  variantId: z.string().regex(VARIANT_ID_REGEX).optional(),
  face_value: z.number().positive().optional(),
  nexus_cost: z.number().positive().optional(),
  member_price: z.number().positive().optional(),
  voucherStackable: z.boolean().nullable().optional(),
  sku: z.string().min(SKU_MIN_LENGTH).max(SKU_MAX_LENGTH).regex(SKU_REGEX).nullable().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  terms: z.string().max(6000).optional(),
  implementationInstructions: z.string().max(4000).optional(),
});

/**
 * Voucher variants + redemption-scope fields shared by the create + update
 * schemas. Both optional: a pre-variant client omits them and the service
 * synthesizes a single variant from the flat fields.
 */
const variantSchemaFields = {
  variants: z.preprocess(
    parseVariantsField,
    z.array(variantInputSchema).min(1).max(MAX_VARIANTS_PER_OFFER).optional(),
  ),
  redemptionScope: z.enum(OFFER_REDEMPTION_SCOPES).optional(),
  // Voucher validity TYPE default for the whole offer (voucher-validity-dating).
  // Empty string from multipart -> null. Cross-checked as required for vouchers
  // in the handler; the validity VALUE is set at the inventory route, not here.
  defaultValidityType: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.enum(VALIDITY_TYPES).nullable().optional(),
  ),
};

/**
 * Per-variant cross-field validation, mirroring the flat-field voucher checks
 * (face/nexus/member bounds, validity both-or-neither + ceiling, mandatory
 * stackable). Returns the first failure with bilingual text, or ok.
 */
function validateVoucherVariants(
  variants: OfferVariantInput[],
): { ok: true } | { ok: false; error: string; errorHe?: string } {
  for (const v of variants) {
    if (!v.face_value || !v.nexus_cost) {
      return { ok: false, error: 'Each voucher variant requires face_value and nexus_cost' };
    }
    if (v.nexus_cost > v.face_value) {
      return { ok: false, error: 'nexus_cost must not be greater than face_value' };
    }
    if (v.member_price !== undefined && (v.member_price < v.nexus_cost || v.member_price > v.face_value)) {
      return { ok: false, error: 'member_price must be between nexus_cost and face_value (inclusive)' };
    }
    // Validity is no longer a variant field: the validity VALUE lives on inventory
    // units (validated at the inventory route), and the validity TYPE is the parent
    // default plus an optional per-variant override (Zod-enum checked above). See
    // voucher-validity-dating. Only price + mandatory stackable are checked here.
    const s = assertVoucherStackable(v.voucherStackable);
    if (!s.ok) return { ok: false, error: s.error, errorHe: s.errorHe };
  }
  // Uniqueness (owner decision 2026-07-16): at most ONE variant per
  // (face_value, stackable) pair - see assertUniqueVariantValueStack.
  const unique = assertUniqueVariantValueStack(variants);
  if (!unique.ok) return { ok: false, error: unique.error, errorHe: unique.errorHe };
  return { ok: true };
}

/**
 * Voucher combine-with-promotions + background-color fields shared by the
 * create + update schemas. Multipart form-data sends scalars as strings:
 *   - voucherStackable: 'true'/'false' -> boolean; '' -> null (no choice).
 *   - voucherBackgroundColor: '' -> null; otherwise must be a #rrggbb hex.
 * The "stackable is mandatory for vouchers" rule is enforced in the handlers
 * (it cannot be expressed in Zod without knowing executionType).
 */
const voucherBackgroundStackableFields = {
  voucherStackable: z.preprocess(
    (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : null),
    z.boolean().nullable().optional(),
  ),
  voucherBackgroundColor: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  ),
  // Optional voucher SKU: blank -> null; otherwise uppercase alnum + - _ , 4-20.
  sku: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.string().min(SKU_MIN_LENGTH).max(SKU_MAX_LENGTH).regex(SKU_REGEX).nullable().optional(),
  ),
};

/**
 * Validates the query string for both list endpoints (admin /platform and
 * member /:tenantId). Coerces numeric strings from URL params, hard-caps the
 * page size at 100 so a malicious client can not request the whole catalog.
 *
 * Member view ignores approvalStatus/adoptionStatus (its read service
 * dis-regards them) but it is harmless to accept them in the same schema.
 */
export const catalogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  /** Free-text filter on the creating tenant's organization name. */
  orgSearch: z.string().trim().min(1).max(100).optional(),
  category: z.enum(OFFER_CATEGORIES).optional(),
  approvalStatus: z.enum(['active', 'pending_approval', 'denied', 'expired']).optional(),
  adoptionStatus: z.enum(['adopted', 'not_adopted']).optional(),
  ownedOnly: z.preprocess(
    (val) => val === 'true' || val === true ? true : val === 'false' || val === false ? false : val,
    z.boolean().optional(),
  ),
  offerTypes: z.preprocess(
    (val) => typeof val === 'string' ? val.split(',').map((s) => s.trim()).filter(Boolean) : val,
    z.array(z.enum(OFFER_EXECUTION_TYPES)).max(10).optional(),
  ),
  priceMin: z.coerce.number().nonnegative().finite().optional(),
  priceMax: z.coerce.number().nonnegative().finite().optional(),
  validFromAfter: z.coerce.date().optional(),
  validUntilBefore: z.coerce.date().optional(),
  tags: z.preprocess(
    (val) => typeof val === 'string'
      ? val.split(',').map((s) => s.trim()).filter(Boolean)
      : val,
    z.array(z.string().min(1).max(40)).max(20).optional(),
  ),
  inStockOnly: z.preprocess(
    (val) => val === 'true' || val === true ? true : val === 'false' || val === false ? false : val,
    z.boolean().optional(),
  ),
  /**
   * Voucher stacking filter (wallet store): 'with' = at least one variant with
   * voucherStackable true (offer-level fallback when no variants), 'without' =
   * at least one false. Offers with no stackable signal match neither value.
   */
  stackable: z.enum(['with', 'without']).optional(),
  sort: z.enum([
    'newest', 'price_asc', 'price_desc', 'expiry_soon', 'expiry_far',
    // Wallet store sorts: stored BASE cashback range (per-tenant effective values
    // applied by the catalog-search module) and Hebrew-aware title order.
    'cashback_desc', 'cashback_asc', 'title_asc',
  ]).optional(),
});

/**
 * Validates the body for creating a new offer.
 * Numeric fields use coerce to handle multipart/form-data string values.
 * face_value, nexus_cost  (required for voucher)
 * member_price            (optional for voucher; defaults to nexus_cost when omitted)
 */
const createOfferSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).default(''),
  category: z.enum(OFFER_CATEGORIES),
  market_price: z.coerce.number().positive().optional(),
  // Admin-only (M7): upload this offer AS an existing tenant. Rejected for
  // non-admins in the handler; never trusted from the client otherwise.
  onBehalfOfTenantId: z.string().trim().min(1).optional(),
  visibility: z.enum(OFFER_VISIBILITY).default('ecosystem'),
  executionType: z.enum(OFFER_EXECUTION_TYPES).default('voucher'),
  stockLimit: z.coerce.number().int().positive().nullable().optional().default(null),
  implementationLink: z.string().url().nullable().optional(),
  implementationInstructions: z.string().max(4000).optional(),
  // Voucher-only: optional https:// link to a page listing participating
  // branches/locations. Forced null server-side for non-voucher offers.
  branchListUrl: httpsUrlSchema.nullable().optional(),
  // ISO string from multipart form; convert to Date in handler.
  // validFrom is optional - null/undefined means the offer goes live as soon as approved.
  // No future-date refinement on validFrom: setting it to today (or the past) is valid
  // and equivalent to "available now".
  validFrom: z.string().optional().nullable(),
  // ISO string from multipart form; convert to Date in handler.
  // Must be a future date on create - updating an existing expiry is allowed in updateOfferSchema.
  validUntil: z.string().optional().nullable().refine(
    (v) => !v || new Date(v) > new Date(),
    { message: 'validUntil must be a future date' }
  ),
  // Voucher combine-with-promotions + background color (voucher-only).
  ...voucherBackgroundStackableFields,
  // Voucher variants + redemption scope + validity-type default (voucher-only;
  // optional for pre-variant clients). Validity VALUE is set at the inventory route.
  ...variantSchemaFields,
  // Voucher-only: max credit-card payments for this voucher (offer-level, all
  // variants). Empty string from multipart = not provided (service defaults to 1).
  maxPayments: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(VOUCHER_PAYMENTS_MIN).max(VOUCHER_PAYMENTS_MAX).optional(),
  ),
  terms: z.string().max(6000).optional(),
  // JSON-encoded array string from multipart form.
  // Invalid JSON falls back to null so Zod fails array validation and returns 400.
  tags: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      try { return JSON.parse(v); } catch { return null; }
    },
    z.array(z.string().max(50)).max(10).optional().default([])
  ),
  // Voucher pricing fields - required for executionType === 'voucher' (cross-field validated in handler).
  face_value: z.coerce.number().positive().optional(),
  nexus_cost: z.coerce.number().positive().optional(),
  member_price: z.coerce.number().positive().optional(),
  // Gallery support: create never keeps any prior URLs, but accept the field
  // for symmetry with update so a single client codepath can build FormData.
  keptImageUrls: z.preprocess(
    parseKeptImageUrlsField,
    z.array(z.string().url()).max(OFFER_IMAGES_MAX).optional(),
  ),
  // Per-new-file crop metadata, aligned to the `images[]` upload order (one
  // entry per file; null = full image). The original file is uploaded as-is;
  // the crop is stored as metadata and applied at display time. keptImageCrops
  // is accepted for symmetry with update (create keeps no prior images).
  newImageCrops: z.preprocess(
    parseImageCropsField,
    z.array(imageCropSchema.nullable()).max(OFFER_IMAGES_MAX).optional(),
  ),
  keptImageCrops: z.preprocess(
    parseImageCropsField,
    z.array(imageCropEntrySchema).max(OFFER_IMAGES_MAX).optional(),
  ),
  // URL-sourced images (re-hosted server-side; see remoteImagesField).
  remoteImages: remoteImagesField,
});

/**
 * Validates the body for updating an existing offer.
 * All fields are optional - only provided fields will be updated.
 */
const updateOfferSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  market_price: z.coerce.number().positive().optional(),
  // Mirrors the spec OFFER_STATUSES enum. supply.service enforces that
  // 'disabled' and 'archived' transitions carry a non-empty statusReason.
  status: z
    .enum(['draft', 'active', 'inactive', 'pending_approval', 'denied', 'disabled', 'expired', 'archived'])
    .optional(),
  statusReason: z.string().min(1).max(1000).optional(),
  // Offer visibility. Accepted from the body but honored ONLY for platform
  // admins - the PATCH handler strips it for everyone else before updateOffer.
  visibility: z.enum(OFFER_VISIBILITY).optional(),
  // Reassign the owning tenant (platform-admin only; stripped for others). When
  // set to a different tenant, the offer is re-stamped to that tenant + its owner
  // identity. Mirrors the create-time onBehalfOfTenantId.
  onBehalfOfTenantId: z.string().trim().min(1).optional(),
  executionType: z.enum(OFFER_EXECUTION_TYPES).optional(),
  // Empty string from the multipart edit form means "no value / clear it".
  // Map it to null before validation so an untouched empty field does not 400.
  stockLimit: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().positive().nullable().optional()),
  implementationLink: z.preprocess((v) => (v === '' ? null : v), z.string().url().nullable().optional()),
  implementationInstructions: z.string().max(4000).optional(),
  // Empty string from the edit form means "clear it" -> null.
  branchListUrl: z.preprocess((v) => (v === '' ? null : v), httpsUrlSchema.nullable().optional()),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  // Voucher combine-with-promotions + background color (voucher-only).
  ...voucherBackgroundStackableFields,
  // Voucher variants + redemption scope + validity-type default (voucher-only;
  // replaces the array wholesale when sent). Validity VALUE is set at the inventory route.
  ...variantSchemaFields,
  // Voucher-only: max credit-card payments for this voucher (offer-level, all
  // variants). Empty string from multipart = not provided (leave unchanged).
  maxPayments: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(VOUCHER_PAYMENTS_MIN).max(VOUCHER_PAYMENTS_MAX).optional(),
  ),
  terms: z.string().max(6000).optional(),
  // Invalid JSON falls back to null so Zod fails array validation and returns 400.
  tags: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      try { return JSON.parse(v); } catch { return null; }
    },
    z.array(z.string().max(50)).max(10).optional()
  ),
  // Voucher pricing fields - can be updated by the offer creator.
  face_value: z.coerce.number().positive().optional(),
  nexus_cost: z.coerce.number().positive().optional(),
  member_price: z.coerce.number().positive().optional(),
  // Gallery reconciliation: ordered list of URLs the user kept from the
  // previous gallery. The service appends any newly-uploaded files after them.
  // Foreign URLs are dropped server-side by `reconcileImageUrls` so injection
  // is impossible. Undefined = gallery untouched.
  keptImageUrls: z.preprocess(
    parseKeptImageUrlsField,
    z.array(z.string().url()).max(OFFER_IMAGES_MAX).optional(),
  ),
  // Crop metadata: `keptImageCrops` carries the current crop for each kept image
  // (keyed by URL); `newImageCrops` aligns to the `images[]` upload order. Both
  // optional - undefined leaves existing crops untouched (gallery untouched).
  keptImageCrops: z.preprocess(
    parseImageCropsField,
    z.array(imageCropEntrySchema).max(OFFER_IMAGES_MAX).optional(),
  ),
  newImageCrops: z.preprocess(
    parseImageCropsField,
    z.array(imageCropSchema.nullable()).max(OFFER_IMAGES_MAX).optional(),
  ),
  // URL-sourced images (re-hosted server-side; see remoteImagesField).
  remoteImages: remoteImagesField,
});

/**
 * Validates the body for setting a tenant's per-offer voucher sale price.
 * The dashboard now sends `memberPrice` (the absolute shekel price customers
 * pay, clamped server-side into [0, face_value]); the legacy `markupPct` field
 * (a percentage on the base price) is still accepted for backward compatibility.
 * At least one must be present. Both are coerced from string to tolerate
 * form-data submissions while the dominant client (dashboard) sends JSON.
 */
const setTenantVoucherPriceSchema = z
  .object({
    memberPrice: z.coerce.number().nonnegative().optional(),
    markupPct: z.coerce.number().nonnegative().optional(),
    /** Optional: target a single variant's per-tenant price (multi-variant vouchers). */
    variantId: z.string().min(1).optional(),
  })
  .refine((d) => d.memberPrice !== undefined || d.markupPct !== undefined, {
    message: 'memberPrice or markupPct required',
  });

/** Body for PATCH /:offerId/nexus-fee - the platform fee % of the margin.
 *  May be fractional. */
const setNexusFeeSchema = z.object({ pct: z.number().min(0).max(100) });

/** Body for PATCH /:offerId/variants/:variantId/sale-price - the raw sale price. */
const setBaseSalePriceSchema = z.object({ salePrice: z.number().positive() });

/**
 * Validates the voucher inventory body. `kind` selects barcode generation
 * (needs `quantity`) or link entry (needs `links`); the per-kind requirement is
 * cross-checked in the handler. Quantity + link count are capped server-side.
 */
const inventorySchema = z.object({
  kind: z.enum(VOUCHER_CODE_KINDS),
  // Barcode units are the provider-supplied strings (rendered client-side as a
  // barcode + QR). The backend stores them verbatim and mints nothing here.
  values: z.array(z.string().trim().min(1).max(2048)).min(1).max(VOUCHER_INVENTORY_MAX).optional(),
  // Each link is a free-text value (any string) with an OPTIONAL paired code. The
  // URL/scheme requirement was removed - a "link" may be any non-empty string. The
  // code charset (VOUCHER_CODE_REGEX) still keeps a stored code from ever becoming
  // a script/markup/injection vector, and the value is never rendered as HTML.
  links: z.array(
    z.object({
      url: z.string().trim().min(1).max(2048),
      code: z.string().regex(VOUCHER_CODE_REGEX).optional(),
    }),
  ).min(1).max(VOUCHER_INVENTORY_MAX).optional(),
  // Per-batch validity stamped onto every unit (voucher-validity-dating). The set
  // that must be supplied depends on the variant's effective type; cross-checked
  // in the handler via resolveBatchValidity. Dates arrive as ISO strings -> coerce.
  validityValue: z.coerce.number().int().positive().nullable().optional(),
  validityUnit: z.enum(VOUCHER_VALIDITY_UNITS).nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});

// ─── Static paths first ───────────────────────────────────────────────────────
// These MUST be registered before /:offerId to prevent Express route conflicts.

/**
 * GET /api/v1/offers/platform
 * Returns all visible platform offers with per-tenant adoption status.
 * Platform admins additionally see pending_approval offers and sensitive pricing fields.
 * Used by the admin Benefits & Partnerships page.
 * Requires: catalog.view permission.
 */
router.get(
  '/platform',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = catalogListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      // The ownedOnly view (Product Catalog page) returns the tenant's OWN
      // uploaded offers, including non-active (pending/denied) ones and their
      // nexus_cost - so it requires catalog-edit authority (supply.manage_offers:
      // owner, admin, supply_manager, platform admin). The browse/adopt view
      // (ownedOnly absent) stays on the broad catalog.view used by adopters.
      const ctx = parsed.data.ownedOnly
        ? await resolveTenantContextWithPermission(req, 'supply.manage_offers')
        : await resolveTenantContextWithPermission(req, 'catalog.view');
      const result = await getTenantCatalogView(ctx.tenantId, parsed.data, {
        isPlatformAdmin: ctx.isPlatformAdmin,
      });
      const pages = Math.max(1, Math.ceil(result.total / parsed.data.limit));
      res.json({
        items: result.items,
        pagination: {
          page: parsed.data.page,
          limit: parsed.data.limit,
          total: result.total,
          pages,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/offers/status/:tenant/:userEmail
 * Returns purchase history for a specific user. Phase 4 stub.
 * Input: tenant id and user email as path params.
 * Output: empty purchasedOffers array until PayMe integration in Phase 4.
 */
router.get(
  '/status/:tenant/:userEmail',
  authenticate,
  (_req: Request, res: Response): void => {
    res.json({ purchasedOffers: [] });
  },
);

/**
 * GET /api/v1/offers/stats/:tenant
 * Returns offer usage statistics for a tenant. Phase 4 stub.
 * Requires: catalog.view permission (enforced via tenantId param in middleware).
 * Output: empty stats array until analytics is implemented in Phase 4.
 */
router.get(
  '/stats/:tenant',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await resolveTenantContextWithPermission(req, 'catalog.view');
      res.json({ stats: [] });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/offers/barcodes/:tenant/:userEmail/:purchaseId
 * Returns barcode for a specific purchase. Phase 4 stub.
 * Output: 404 until purchase + barcode delivery is implemented in Phase 4.
 */
router.get(
  '/barcodes/:tenant/:userEmail/:purchaseId',
  authenticate,
  (_req: Request, res: Response): void => {
    res.status(404).json({ error: 'No purchase found' });
  },
);

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * POST /api/v1/offers
 * Creates a new platform offer. Accepts optional image file via multipart/form-data.
 * Requires: supply.ingest permission.
 *
 * Voucher ecosystem offers enter 'pending_approval' status automatically.
 * An approval-request email is sent to all NEXUS platform admins.
 *
 * Input body (multipart or JSON):
 *   title, description, category, market_price (optional), visibility
 *   face_value, nexus_cost  (required for voucher)
 *   member_price            (optional for voucher; defaults to nexus_cost when omitted)
 * Input file (optional): image field, max 5 MB.
 * Output: created offer document (includes nexus_cost for creator).
 */
router.post(
  '/',
  authenticate,
  // Accept up to OFFER_IMAGES_MAX files under field name `images`. The single
  // legacy `image` field is no longer used by the dashboard; older clients
  // that still send it will simply ship 0 files here, which is treated as
  // "no images uploaded" and falls back to the placeholder.
  upload.array('images', OFFER_IMAGES_MAX),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createOfferSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const ctx = await resolveTenantContextWithPermission(req, 'supply.ingest');

      // M7: admin-only "upload on behalf of a tenant". A non-admin can never set it.
      const onBehalfOfTenantId = parsed.data.onBehalfOfTenantId;
      if (onBehalfOfTenantId && !ctx.isPlatformAdmin) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      // A platform admin must upload ON BEHALF of a tenant - they can no longer
      // create platform-owned offers, so a tenant choice is required.
      if (ctx.isPlatformAdmin && !onBehalfOfTenantId) {
        res.status(400).json({
          error: 'Choose an organization to upload the offer on behalf of',
          errorHe: 'יש לבחור ארגון שעבורו מעלים את ההצעה',
        });
        return;
      }
      let targetTenant: { tenantId: string; createdByIdentityId: string } | null = null;
      if (onBehalfOfTenantId) {
        const db = await getMongoDb();
        const t = await getTenantDomainCollections(db).domainTenants.findOne(
          { tenantId: onBehalfOfTenantId }, { projection: { tenantId: 1, createdByIdentityId: 1 } },
        );
        if (!t) { res.status(404).json({ error: 'tenant_not_found' }); return; }
        targetTenant = { tenantId: t.tenantId, createdByIdentityId: t.createdByIdentityId };
      }
      // Who the offer is stamped as + effective visibility + force-active status.
      // No on-behalf: caller (admins still forced ecosystem for their OWN offers).
      const attribution = resolveCreateAttribution(
        { tenantId: ctx.tenantId, identityId: ctx.identityId, isPlatformAdmin: ctx.isPlatformAdmin ?? false },
        onBehalfOfTenantId, targetTenant, parsed.data.visibility,
      );
      const finalVisibility = attribution.visibility;

      // M9: publishing ANY offer (ecosystem OR tenant_only) requires a NEXUS-admin
      // APPROVED business setup so the tenant is vetted. Enforced in dev AND prod
      // (dev gets approved via the business-setup dev-request shortcut). Platform
      // admins (always on-behalf per M7) bypass regardless of the target's status.
      const createApproved = ctx.isPlatformAdmin ? true : await isTenantBusinessSetupApproved(ctx.tenantId);
      if (!canTenantCreateOffer(ctx.isPlatformAdmin ?? false, createApproved)) {
        res.status(403).json({
          error: 'Your business setup is pending platform approval before you can publish offers',
          errorHe: 'הגדרת העסק שלך ממתינה לאישור הפלטפורמה לפני פרסום הצעות',
        });
        return;
      }

      // Cross-field validation for voucher pricing/validity/stackable. With a
      // variant-aware client every variant is checked; a pre-variant client is
      // checked on its flat fields (the service synthesizes one variant from them).
      // These checks cannot be expressed in Zod without knowing the final visibility.
      const d = parsed.data;
      if (d.executionType === 'voucher') {
        // Validity TYPE is no longer chosen at the offer level - it is set per
        // inventory BATCH at the inventory route (see voucher-unit-level-dating).
        // `defaultValidityType` remains an optional stored hint only; it is NOT
        // required to publish. Do not re-add an offer-level validity-type gate here.
        if (d.variants && d.variants.length > 0) {
          const vr = validateVoucherVariants(d.variants);
          if (!vr.ok) {
            res.status(400).json({ error: vr.error, ...(vr.errorHe && { errorHe: vr.errorHe }) });
            return;
          }
        } else {
          if (!d.face_value || !d.nexus_cost) {
            res.status(400).json({ error: 'Voucher offers require face_value and nexus_cost' });
            return;
          }
          if (d.nexus_cost > d.face_value) {
            res.status(400).json({ error: 'nexus_cost must not be greater than face_value' });
            return;
          }
          if (d.member_price !== undefined && (d.member_price < d.nexus_cost || d.member_price > d.face_value)) {
            res.status(400).json({ error: 'member_price must be between nexus_cost and face_value (inclusive)' });
            return;
          }
          // Combine-with-promotions is a mandatory, no-default choice for vouchers.
          const s = assertVoucherStackable(d.voucherStackable);
          if (!s.ok) {
            res.status(400).json({ error: s.error, errorHe: s.errorHe });
            return;
          }
        }
      }

      // Voucher single-image rule: a voucher carries exactly one card image
      // (uploaded file OR URL-sourced). multer already caps total file count
      // at OFFER_IMAGES_MAX; this narrows the combined count to 1 for
      // vouchers. Re-enforced server-side regardless of the UI.
      const uploadedFileCount = Array.isArray(req.files) ? req.files.length : 0;
      const remoteCount = d.remoteImages?.length ?? 0;
      if (d.executionType === 'voucher' && uploadedFileCount + remoteCount > 1) {
        res.status(400).json({
          error: 'A voucher offer can have at most one image',
          errorHe: 'שובר יכול לכלול תמונה אחת בלבד',
        });
        return;
      }
      // Combined cap across sources (multer only caps the file field).
      if (uploadedFileCount + remoteCount > OFFER_IMAGES_MAX) {
        res.status(400).json({
          error: `An offer can have at most ${OFFER_IMAGES_MAX} images.`,
        });
        return;
      }

      // Convert validFrom/validUntil ISO strings (from multipart form) to Date objects.
      const { validFrom: validFromStr, validUntil: validUntilStr, ...restParsed } = parsed.data;
      const validFromDate = validFromStr ? new Date(validFromStr) : null;
      const validUntilDate = validUntilStr ? new Date(validUntilStr) : null;
      // Spec rule: a scheduled-release date must be before the expiry date.
      if (validFromDate && validUntilDate && validFromDate >= validUntilDate) {
        res.status(400).json({ error: 'validFrom must be before validUntil' });
        return;
      }
      // Multer with `.array(...)` populates req.files (array). We strip
      // `keptImageUrls` from the payload because create never reconciles a
      // prior gallery — the service treats `imageFiles` as the whole gallery.
      const imageFiles = Array.isArray(req.files)
        ? (req.files as Express.Multer.File[]).map((f) => ({
            buffer: f.buffer,
            originalname: f.originalname,
            mimetype: f.mimetype,
          }))
        : [];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit these keys from the rest payload
      const { keptImageUrls: _ignoredKept, keptImageCrops: _ignoredKeptCrops, onBehalfOfTenantId: _obo, ...createPayload } = restParsed;
      const offer = await createOffer({
        ...createPayload,
        visibility: finalVisibility,
        validFrom: validFromDate,
        validUntil: validUntilDate,
        imageFiles,
        createdByTenantId: attribution.createdByTenantId,
        createdByIdentityId: attribution.createdByIdentityId,
        forceActiveStatus: attribution.forceActive,
        // M9: record the acting admin when uploading on behalf, for the admin catalog.
        ...(onBehalfOfTenantId ? { uploadedByIdentityId: ctx.identityId } : {}),
      });

      // Auto-adopt tenant_only offers for the OWNING tenant (the target when the
      // admin uploaded on behalf) so the offer appears in their catalog immediately.
      if (offer.visibility === 'tenant_only') {
        try {
          await adoptOffer(attribution.createdByTenantId, offer.offerId, attribution.createdByIdentityId);
        } catch (err) {
          // Log but do not fail the response - offer was created successfully.
          console.error('[OFFERS] Auto-adopt failed for tenant_only offer:', err);
        }
      }

      // Admin-offer auto-adopt: an on-behalf ECOSYSTEM offer (admin-uploaded,
      // publishes active) is adopted into every eligible tenant's catalog.
      // Best-effort: never fails the creation response.
      if (onBehalfOfTenantId && offer.visibility === 'ecosystem' && offer.status === 'active') {
        try {
          await autoAdoptOfferForAllTenants(offer.offerId);
        } catch (err) {
          console.error('[OFFERS] Admin-offer auto-adopt fan-out failed:', err);
        }
      }

      // Send approval-request emails to platform admins when the offer enters the approval queue.
      if (offer.status === 'pending_approval') {
        const adminEmails = getConfiguredAdminEmails();
        // Look up the supplier tenant name for the email body.
        try {
          const db = await getMongoDb();
          const tenantCollections = getTenantDomainCollections(db);
          const tenantDoc = await tenantCollections.domainTenants.findOne({ tenantId: ctx.tenantId });
          const supplierName = tenantDoc?.organizationName ?? ctx.tenantId;
          // Fire-and-forget: do not await so email latency cannot affect response time.
          sendVoucherApprovalRequestEmail(adminEmails, offer, supplierName).catch((err) => {
            console.error('[OFFERS] Approval-request email failed:', err);
          });
        } catch (err) {
          // Email lookup failure must not fail the creation response.
          console.error('[OFFERS] Could not resolve supplier name for approval email:', err);
        }
      }

      res.status(201).json({ offer });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/offers/bulk
 * Bulk-creates voucher offers from parsed CSV rows (one row = one voucher).
 * Requires: supply.ingest permission. Tenant + identity derive from the session.
 *
 * The body is validated leniently here (array of string-maps, capped) so a
 * single malformed row does not 400 the whole batch; each row's content is
 * validated inside the bulk service, which returns a per-row result.
 *
 * Input body: { offers: Array<Record<string,string>> } (<= BULK_MAX_ROWS).
 * Output: { results: [{ index, status, offerId?, error? }], created, failed }.
 */
router.post(
  '/bulk',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const bodySchema = z.object({
        offers: z.array(z.record(z.string(), z.string())).min(1).max(BULK_MAX_ROWS),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const ctx = await resolveTenantContextWithPermission(req, 'supply.ingest');

      // Ecosystem rows are only allowed once business setup is complete (same
      // rule as single create); computed once and applied per row in the service.
      const { onboarding } = await getOnboardingStatus(req.user!.sub);
      const businessSetupComplete = onboarding.step !== 'business_setup';

      const result = await createVouchersBulk({
        rows: parsed.data.offers,
        tenantId: ctx.tenantId,
        identityId: ctx.identityId,
        isPlatformAdmin: ctx.isPlatformAdmin ?? false,
        businessSetupComplete,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/offers/:offerId
 * Updates mutable fields on an offer owned by the requesting tenant.
 * Accepts optional replacement image via multipart/form-data.
 * Requires: supply.manage_offers permission.
 * Ownership is enforced by supply.service - only the creating tenant may update.
 *
 * Resubmit flow: if the offer was in 'denied' status, editing automatically
 * transitions it to 'pending_approval' and sends a new approval-request email to admins.
 *
 * Input body (multipart or JSON): any subset of offer fields including face_value, nexus_cost, member_price.
 * Input file (optional): image field, max 5 MB.
 * Output: updated offer document, or 404 when not found / not owned.
 */
router.patch(
  '/:offerId',
  authenticate,
  upload.array('images', OFFER_IMAGES_MAX),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = updateOfferSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const ctx = await resolveTenantContextWithPermission(
        req,
        'supply.manage_offers',
      );

      // Voucher pricing lock (face_value + nexus_cost = the Nexus<->supplier deal)
      // is enforced in updateOffer, which knows the offer's visibility + owner:
      // ecosystem offers stay platform-admin-only, while a tenant_only offer's
      // owning tenant may change its sale price + face value. Enforcing it there
      // (it loads the offer) avoids a redundant load + a split rule in two places.

      // Visibility is platform-admin-only. Strip it for everyone else so a
      // non-admin cannot change who sees the offer (the frontend hides the
      // control too, but this is the real guard).
      if (!ctx.isPlatformAdmin && parsed.data.visibility !== undefined) {
        delete parsed.data.visibility;
      }

      // Owner reassignment is platform-admin-only. Strip it for everyone else; for
      // an admin, resolve + validate the target tenant so the offer can be
      // re-stamped to it + its owner identity (mirrors the create-time on-behalf
      // attribution). updateOffer removes the offer from the old owner.
      let ownerReassign: { ownerTenantId: string; ownerIdentityId: string } | undefined;
      if (parsed.data.onBehalfOfTenantId !== undefined) {
        if (!ctx.isPlatformAdmin) {
          delete parsed.data.onBehalfOfTenantId;
        } else {
          const db = await getMongoDb();
          const t = await getTenantDomainCollections(db).domainTenants.findOne(
            { tenantId: parsed.data.onBehalfOfTenantId },
            { projection: { tenantId: 1, createdByIdentityId: 1 } },
          );
          if (!t) { res.status(404).json({ error: 'tenant_not_found' }); return; }
          ownerReassign = { ownerTenantId: t.tenantId, ownerIdentityId: t.createdByIdentityId };
        }
      }

      // Convert validFrom/validUntil ISO strings (from multipart form) to Date objects.
      // onBehalfOfTenantId is consumed above (not an updateOffer field) - drop it.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit the key from the rest payload
      const { validFrom: validFromStr, validUntil: validUntilStr, onBehalfOfTenantId: _obo, ...restParsed } = parsed.data;
      const validFromDate = validFromStr !== undefined
        ? (validFromStr ? new Date(validFromStr) : null)
        : undefined;
      const validUntilDate = validUntilStr !== undefined
        ? (validUntilStr ? new Date(validUntilStr) : null)
        : undefined;
      // Cross-field guard: when BOTH are present and non-null, validFrom < validUntil.
      if (validFromDate && validUntilDate && validFromDate >= validUntilDate) {
        res.status(400).json({ error: 'validFrom must be before validUntil' });
        return;
      }
      const imageFiles = Array.isArray(req.files)
        ? (req.files as Express.Multer.File[]).map((f) => ({
            buffer: f.buffer,
            originalname: f.originalname,
            mimetype: f.mimetype,
          }))
        : [];
      // Belt+suspenders cap: kept + new uploaded + URL-sourced must not exceed
      // OFFER_IMAGES_MAX. multer only caps the file field.
      const keptCount = restParsed.keptImageUrls?.length ?? 0;
      const remoteCount = restParsed.remoteImages?.length ?? 0;
      if (keptCount + imageFiles.length + remoteCount > OFFER_IMAGES_MAX) {
        res.status(400).json({
          error: `An offer can have at most ${OFFER_IMAGES_MAX} images.`,
        });
        return;
      }
      // Voucher single-image rule. The frontend always sends executionType on
      // save; when it indicates a voucher, kept + uploaded + URL-sourced must
      // be at most 1.
      if (restParsed.executionType === 'voucher' && keptCount + imageFiles.length + remoteCount > 1) {
        res.status(400).json({
          error: 'A voucher offer can have at most one image',
          errorHe: 'שובר יכול לכלול תמונה אחת בלבד',
        });
        return;
      }
      // Voucher cross-field checks on update. A variant-aware client is checked
      // per variant; a pre-variant client on its flat fields.
      if (restParsed.executionType === 'voucher') {
        if (restParsed.variants && restParsed.variants.length > 0) {
          const vr = validateVoucherVariants(restParsed.variants);
          if (!vr.ok) {
            res.status(400).json({ error: vr.error, ...(vr.errorHe && { errorHe: vr.errorHe }) });
            return;
          }
        } else {
          const s = assertVoucherStackable(restParsed.voucherStackable);
          if (!s.ok) {
            res.status(400).json({ error: s.error, errorHe: s.errorHe });
            return;
          }
        }
      }
      const { keptImageUrls, ...restNoKept } = restParsed;
      const result = await updateOffer(req.params.offerId, ctx.tenantId, {
        ...restNoKept,
        ...(ownerReassign ?? {}),
        ...(validFromDate !== undefined && { validFrom: validFromDate }),
        ...(validUntilDate !== undefined && { validUntil: validUntilDate }),
        imageFiles,
        ...(keptImageUrls !== undefined && { keptImageUrls }),
      }, ctx.isPlatformAdmin === true);

      if (!result) {
        res.status(404).json({ error: 'Offer not found or you do not own this offer' });
        return;
      }

      const { offer, wasResubmitted, wasUpdatedWhilePending } = result;

      // Notify admins when a denied offer is resubmitted OR when a pending offer is updated.
      // Both cases require admins to re-review; isUpdate distinguishes the subject line.
      // Skip when the offer ended up 'active' (e.g. a trusted / autoApproveOffers tenant),
      // since there is nothing left to review.
      if ((wasResubmitted || wasUpdatedWhilePending) && offer.status === 'pending_approval') {
        const adminEmails = getConfiguredAdminEmails();
        try {
          const db = await getMongoDb();
          const tenantCollections = getTenantDomainCollections(db);
          const tenantDoc = await tenantCollections.domainTenants.findOne({ tenantId: ctx.tenantId });
          const supplierName = tenantDoc?.organizationName ?? ctx.tenantId;
          sendVoucherApprovalRequestEmail(adminEmails, offer, supplierName, wasUpdatedWhilePending).catch((err) => {
            console.error('[OFFERS] Approval-request email (update/resubmit) failed:', err);
          });
        } catch (err) {
          console.error('[OFFERS] Could not resolve supplier name for update/resubmit email:', err);
        }
      }

      res.json({ offer });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/offers/:offerId/approve
 * Approves a voucher offer that is currently in pending_approval status.
 * Sets status to 'active' so all tenants can adopt it.
 * Sends an approval notification email to the supplier.
 *
 * Authorization: platform admin only (NEXUS_ADMIN_EMAILS).
 *
 * Input:  offerId as path param.
 * Output: { success: true } on approval, or 404 when not found / not in pending_approval.
 */
router.post(
  '/:offerId/approve',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContext(req);

      if (!ctx.isPlatformAdmin) {
        res.status(403).json({ error: 'Only platform admins can approve offers' });
        return;
      }

      const approvedOffer = await approveOffer(req.params.offerId);
      if (!approvedOffer) {
        res.status(404).json({ error: 'Offer not found or not in pending_approval status' });
        return;
      }

      // Notify the supplier that their offer is now live.
      try {
        const db = await getMongoDb();
        const identityCollections = getIdentityDomainCollections(db);
        const tenantCollections = getTenantDomainCollections(db);

        const [supplierIdentity, supplierTenant] = await Promise.all([
          identityCollections.nexusIdentities.findOne({
            nexusIdentityId: approvedOffer.createdByIdentityId,
          }),
          tenantCollections.domainTenants.findOne({ tenantId: approvedOffer.createdByTenantId }),
        ]);

        if (supplierIdentity?.normalizedEmail) {
          const tenantName = supplierTenant?.organizationName ?? approvedOffer.createdByTenantId;
          sendVoucherApprovedEmail(supplierIdentity.normalizedEmail, approvedOffer, tenantName).catch((err) => {
            console.error('[OFFERS] Approved email failed:', err);
          });
        }
      } catch (err) {
        console.error('[OFFERS] Could not resolve supplier info for approved email:', err);
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/offers/:offerId/deny
 * Denies a voucher offer that is currently in pending_approval status.
 * Sets status to 'denied' and records the reason so the supplier can edit and resubmit.
 * Sends a denial notification email to the supplier.
 *
 * Authorization: platform admin only (NEXUS_ADMIN_EMAILS).
 *
 * Input body:
 *   reason - string (min 10, max 1000 chars) explaining the denial.
 * Input path: offerId.
 * Output: { success: true } on denial, or 404 when not found / not in pending_approval.
 */
router.post(
  '/:offerId/deny',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContext(req);

      if (!ctx.isPlatformAdmin) {
        res.status(403).json({ error: 'Only platform admins can deny offers' });
        return;
      }

      // Validate denial reason.
      const bodySchema = z.object({
        reason: z.string().min(10).max(1000),
      });
      const bodyParsed = bodySchema.safeParse(req.body);
      if (!bodyParsed.success) {
        res.status(400).json({ error: bodyParsed.error.flatten() });
        return;
      }

      const deniedOffer = await denyOffer(req.params.offerId, bodyParsed.data.reason);
      if (!deniedOffer) {
        res.status(404).json({ error: 'Offer not found or not in pending_approval status' });
        return;
      }

      // Notify the supplier with the reason so they can correct and resubmit.
      try {
        const db = await getMongoDb();
        const identityCollections = getIdentityDomainCollections(db);
        const tenantCollections = getTenantDomainCollections(db);

        const [supplierIdentity, supplierTenant] = await Promise.all([
          identityCollections.nexusIdentities.findOne({
            nexusIdentityId: deniedOffer.createdByIdentityId,
          }),
          tenantCollections.domainTenants.findOne({ tenantId: deniedOffer.createdByTenantId }),
        ]);

        if (supplierIdentity?.normalizedEmail) {
          const tenantName = supplierTenant?.organizationName ?? deniedOffer.createdByTenantId;
          sendVoucherDeniedEmail(
            supplierIdentity.normalizedEmail,
            deniedOffer,
            bodyParsed.data.reason,
            tenantName,
          ).catch((err) => {
            console.error('[OFFERS] Denied email failed:', err);
          });
        }
      } catch (err) {
        console.error('[OFFERS] Could not resolve supplier info for denied email:', err);
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/offers/:offerId
 * Soft-deletes a platform offer and cascades removal from all tenant catalogs.
 *
 * - Sets offer status to 'inactive' (preserves purchase/transaction history).
 * - Removes the associated Cloudinary image (errors swallowed - must not block).
 * - Deletes all TenantOfferConfig adoption records for this offer.
 * - Does NOT touch purchase or transaction records.
 *
 * Authorization:
 *   Tenant admins may only delete their own offers (createdByTenantId match).
 *   Platform admins (NEXUS_ADMIN_EMAILS) may delete any offer.
 * Requires: supply.manage_offers permission.
 *
 * Input: offerId as path param.
 * Output: { success: true } on deletion, or 404 when not found / not authorized.
 */
router.delete(
  '/:offerId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const deletedOffer = await deleteOffer(req.params.offerId, ctx.tenantId, ctx.isPlatformAdmin ?? false);

      // Notify about a deleted pending offer. Two cases:
      //  - A platform admin removed it -> tell the SUPPLIER their offer was not
      //    approved (admin-delete of a pending offer acts as a soft denial).
      //  - The supplier withdrew their own -> tell the admins they need not review.
      if (deletedOffer.status === 'pending_approval') {
        try {
          const db = await getMongoDb();
          if (ctx.isPlatformAdmin) {
            // Admin removed a SUPPLIER's offer -> tell that supplier it was not
            // approved. An admin deleting their own offer notifies no one.
            if (deletedOffer.createdByTenantId !== ctx.tenantId) {
              const identityCollections = getIdentityDomainCollections(db);
              const identity = await identityCollections.nexusIdentities.findOne({ nexusIdentityId: deletedOffer.createdByIdentityId });
              if (identity?.normalizedEmail) {
                sendOfferRemovedByAdminEmail(identity.normalizedEmail, deletedOffer).catch((err) => {
                  console.error('[OFFERS] Offer-removed email failed:', err);
                });
              }
            }
          } else {
            // Supplier withdrew their own pending offer: notify platform admins.
            const tenantCollections = getTenantDomainCollections(db);
            const tenantDoc = await tenantCollections.domainTenants.findOne({ tenantId: ctx.tenantId });
            const supplierName = tenantDoc?.organizationName ?? ctx.tenantId;
            sendVoucherWithdrawnEmail(getConfiguredAdminEmails(), deletedOffer, supplierName).catch((err) => {
              console.error('[OFFERS] Withdrawn email failed:', err);
            });
          }
        } catch (err) {
          console.error('[OFFERS] Could not send pending-offer deletion email:', err);
        }
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/offers/:offerId/adopt
 * Adopts a platform offer into the tenant's member-facing catalog.
 * Requires: catalog.adopt_offer permission.
 *
 * No business-setup gate: any tenant with the permission may adopt, regardless
 * of business-setup approval status (gate removed 2026-07-15).
 *
 * Input: offerId as path param.
 * Output: { success: true } on adoption.
 *         404 when the offer is not found or not visible to this tenant.
 */
router.post(
  '/:offerId/adopt',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId, identityId } = await resolveTenantContextWithPermission(
        req,
        'catalog.adopt_offer',
      );

      await adoptOffer(tenantId, req.params.offerId, identityId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/offers/:offerId/adopt
 * Removes an offer from the tenant's member-facing catalog.
 * Requires: catalog.adopt_offer permission.
 *
 * Input: offerId as path param.
 * Output: { success: true }. No-op when offer was never adopted.
 */
router.delete(
  '/:offerId/adopt',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = await resolveTenantContextWithPermission(
        req,
        'catalog.adopt_offer',
      );
      await excludeOffer(tenantId, req.params.offerId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/offers/:offerId/tenant-price
 *
 * Sets the caller-tenant's per-offer voucher member price. The caller's
 * tenantId is derived from the authenticated session via
 * resolveTenantContextWithPermission; the browser never supplies it. Service
 * layer enforces voucher-only, adopted-only, and [nexus_cost, face_value]
 * bounds.
 *
 * Requires: catalog.adopt_offer permission (same surface as adopt/unadopt -
 * pricing is part of the per-tenant catalog configuration).
 *
 * Input body: { memberPrice?: number (>= 0), markupPct?: number (>= 0, legacy), variantId?: string }.
 * Output: { config: TenantOfferConfig } on 200; error JSON otherwise.
 *   404 - offer_not_found
 *   403 - not_adopted
 *   400 - validation failure, not_voucher, or out_of_bounds
 */
router.patch(
  '/:offerId/tenant-price',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = setTenantVoucherPriceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'memberPrice or markupPct required and must be >= 0' });
        return;
      }

      const { tenantId, isPlatformAdmin } = await resolveTenantContextWithPermission(
        req,
        'catalog.adopt_offer',
      );

      const result = await setTenantVoucherPrice({
        tenantId,
        offerId: req.params.offerId,
        isPlatformAdmin: isPlatformAdmin ?? false,
        ...(parsed.data.memberPrice !== undefined && { memberPrice: parsed.data.memberPrice }),
        ...(parsed.data.markupPct !== undefined && { markupPct: parsed.data.markupPct }),
        ...(parsed.data.variantId !== undefined && { variantId: parsed.data.variantId }),
      });

      if (!result.ok) {
        const code =
          result.reason === 'offer_not_found' ? 404 :
          result.reason === 'variant_not_found' ? 404 :
          result.reason === 'not_adopted' ? 403 :
          result.reason === 'owner_locked' ? 403 :
          400;
        res.status(code).json({ error: result.reason });
        return;
      }

      res.json({ config: result.config });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/offers/:offerId/nexus-fee
 *
 * Sets the offer's platform fee percentage (nexusFeePct) and re-bakes all
 * derived pricing (variant member_price, mirror, displayPrice, adopter floors).
 * The fee is never exposed to tenants; this route is PLATFORM ADMIN ONLY.
 *
 * Input body: { pct: int 0..100 }.
 * Output: { success: true, nexusFeePct } on 200; error JSON otherwise.
 *   403 - caller is not a platform admin
 *   404 - offer_not_found
 *   400 - invalid body or not_voucher
 */
router.patch(
  '/:offerId/nexus-fee',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContext(req);
      if (!ctx.isPlatformAdmin) {
        res.status(403).json({ error: 'Only platform admins can set the nexus fee' });
        return;
      }

      const parsed = setNexusFeeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'pct must be an integer between 0 and 100' });
        return;
      }

      const result = await setNexusFeePct(req.params.offerId, parsed.data.pct);
      if (!result.ok) {
        res.status(result.reason === 'offer_not_found' ? 404 : 400).json({ error: result.reason });
        return;
      }

      res.json({ success: true, nexusFeePct: parsed.data.pct });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/offers/:offerId/variants/:variantId/sale-price
 *
 * PLATFORM-ADMIN edit of one variant's sale price (nexus_cost) from the price
 * popover's main slider. The fee % is untouched; member_price re-bakes from the
 * stored fee, mirror + displayPrice recompute, adopter overrides re-sync.
 *
 * Input body: { salePrice: number > 0, <= variant face_value }.
 * Output: { success: true } on 200; error JSON otherwise.
 *   403 - caller is not a platform admin
 *   404 - offer_not_found / variant_not_found
 *   400 - invalid body, not_voucher, or out_of_bounds
 */
router.patch(
  '/:offerId/variants/:variantId/sale-price',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContext(req);
      if (!ctx.isPlatformAdmin) {
        res.status(403).json({ error: 'Only platform admins can set the base sale price' });
        return;
      }

      const parsed = setBaseSalePriceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'salePrice must be a positive number' });
        return;
      }

      const result = await setVariantBaseSalePrice(
        req.params.offerId,
        req.params.variantId,
        parsed.data.salePrice,
      );
      if (!result.ok) {
        const code =
          result.reason === 'offer_not_found' ? 404 :
          result.reason === 'variant_not_found' ? 404 :
          400;
        res.status(code).json({ error: result.reason });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Loads a voucher offer the caller owns for an inventory operation, returning
 * its variants on success or an { error, status } to send. Centralizes the
 * not-found / not-owned / non-voucher guards shared by the inventory routes.
 */
async function loadOwnedVoucherForInventory(
  offerId: string,
  ctx: { tenantId: string; isPlatformAdmin?: boolean },
): Promise<
  | { ok: true; variants: OfferVariant[] }
  | { ok: false; status: number; error: string }
> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);
  const offer = await nexusOffers.findOne(
    { offerId, ...NOT_DELETED },
    { projection: { createdByTenantId: 1, executionType: 1, variants: 1 } },
  );
  if (!offer || (!ctx.isPlatformAdmin && offer.createdByTenantId !== ctx.tenantId)) {
    return { ok: false, status: 404, error: 'Offer not found or you do not own this offer' };
  }
  if (offer.executionType !== 'voucher') {
    return { ok: false, status: 400, error: 'Inventory is only supported for voucher offers' };
  }
  return { ok: true, variants: offer.variants ?? [] };
}

/**
 * Validates a per-batch validity and normalizes it (voucher-validity-dating). The
 * batch declares its own TYPE by which fields it carries - a batch is exactly one
 * type, never both, never neither:
 *   - duration ("limit"): validityValue + validityUnit (ceiling-checked); the
 *     window is filled at purchase, so from/until must NOT be sent.
 *   - window ("from_until"): validFrom + validUntil (validUntil on/after validFrom);
 *     no duration.
 * There is no variant-level type: the offer's defaultValidityType is only a UI
 * default for the upload modal. Returns the BatchValidity, or a bilingual 400.
 */
function resolveBatchValidity(
  data: BatchValidity,
): { ok: true; validity: BatchValidity } | { ok: false; error: string; errorHe: string } {
  const hasDuration = data.validityValue != null || data.validityUnit != null;
  const hasWindow = data.validFrom != null || data.validUntil != null;
  if (hasDuration && hasWindow) {
    return { ok: false, error: 'A batch is one validity type: a duration OR a date range, not both', errorHe: 'לאצווה סוג תוקף אחד: או משך זמן או טווח תאריכים, לא שניהם' };
  }
  if (!hasDuration && !hasWindow) {
    return { ok: false, error: 'A batch requires a validity: a duration or a date range', errorHe: 'אצווה מחייבת תוקף: משך זמן או טווח תאריכים' };
  }
  if (hasDuration) {
    const v = assertVoucherValidity(data.validityValue, data.validityUnit);
    if (!v.ok) return { ok: false, error: v.error, errorHe: v.errorHe };
    if (data.validityValue == null || data.validityUnit == null) {
      return { ok: false, error: 'A duration validity requires both an amount and a unit', errorHe: 'תוקף מסוג משך זמן מחייב כמות ויחידת זמן' };
    }
    // A unit is exactly one type: clear any prior date window so editing a
    // from_until unit back to a limit does not leave the old validFrom/validUntil.
    return { ok: true, validity: { validityValue: data.validityValue, validityUnit: data.validityUnit, validFrom: null, validUntil: null } };
  }
  if (data.validFrom == null || data.validUntil == null) {
    return { ok: false, error: 'A date-range validity requires both a from and an until date', errorHe: 'תוקף מסוג טווח תאריכים מחייב תאריך התחלה ותאריך סיום' };
  }
  if (new Date(data.validUntil).getTime() < new Date(data.validFrom).getTime()) {
    return { ok: false, error: 'validUntil must be on or after validFrom', errorHe: 'תאריך הסיום חייב להיות באותו יום או אחרי תאריך ההתחלה' };
  }
  // Mirror of the limit branch: clear the duration so a unit is exactly one type.
  return { ok: true, validity: { validFrom: data.validFrom, validUntil: data.validUntil, validityValue: null, validityUnit: null } };
}

/**
 * Dispatches a validated inventory body to the right service call for a variant.
 * Throws createError(400) when the field required by the chosen kind is missing.
 */
async function applyInventoryUnits(
  offerId: string,
  variantId: string,
  data: z.infer<typeof inventorySchema>,
  validity: BatchValidity,
): Promise<InventoryResult> {
  if (data.kind === 'barcode') {
    if (!data.values || data.values.length === 0) {
      throw createError('values is required to add barcode inventory', 400);
    }
    return addBarcodes(offerId, variantId, data.values, validity);
  }
  if (!data.links || data.links.length === 0) {
    throw createError('links is required to add link inventory', 400);
  }
  return addLinks(offerId, variantId, data.links, validity);
}

/**
 * Resolves the default variant for the offer-level compatibility routes: the
 * sole variant when there is exactly one. Multiple variants are ambiguous (the
 * caller must use the variant-scoped route); zero means an unmigrated offer.
 */
function resolveDefaultVariantId(
  variants: OfferVariant[],
): { ok: true; variantId: string } | { ok: false; status: number; error: string } {
  if (variants.length === 1) return { ok: true, variantId: variants[0].variantId };
  if (variants.length === 0) {
    return { ok: false, status: 400, error: 'This voucher has no variant to attach inventory to' };
  }
  return { ok: false, status: 400, error: 'This voucher has multiple variants; specify a variant id' };
}

/**
 * POST /api/v1/offers/:offerId/variants/:variantId/inventory
 * Appends redeemable inventory (provider barcode strings or links) to ONE variant
 * the caller owns, and resyncs the offer's stockLimit to its total unit count.
 *
 * Authorization: supply.manage_offers; ownership enforced. Voucher-only.
 * Output: { created, variantCount, stockLimit }. 404 not found/owned, 404 unknown
 * variant, 400 non-voucher / missing field, 409 kind mismatch / barcode collision.
 */
router.post(
  '/:offerId/variants/:variantId/inventory',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = inventorySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const guard = await loadOwnedVoucherForInventory(req.params.offerId, ctx);
      if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
      if (!guard.variants.some((v) => v.variantId === req.params.variantId)) {
        res.status(404).json({ error: 'Variant not found on this offer' });
        return;
      }
      const vr = resolveBatchValidity(parsed.data);
      if (!vr.ok) { res.status(400).json({ error: vr.error, errorHe: vr.errorHe }); return; }
      const result = await applyInventoryUnits(req.params.offerId, req.params.variantId, parsed.data, vr.validity);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/offers/:offerId/variants/:variantId/inventory
 * Returns one variant's link values + per-kind counts to pre-fill the Edit popup.
 */
router.get(
  '/:offerId/variants/:variantId/inventory',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const guard = await loadOwnedVoucherForInventory(req.params.offerId, ctx);
      if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
      if (!guard.variants.some((v) => v.variantId === req.params.variantId)) {
        res.status(404).json({ error: 'Variant not found on this offer' });
        return;
      }
      const summary = await getInventorySummary(req.params.offerId, req.params.variantId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/offers/:offerId/inventory/counts
 * Per-variant inventory unit COUNTS + real VALIDITY batches for an offer the
 * caller can SEE in the catalog: their own offers, or an ACTIVE ecosystem
 * offer (platform admins see any). Unlike the owner-only summaries above, this
 * returns numbers/dates only - never code values - so the Benefits table can
 * show another supplier's stock and each variant's actual validity without
 * exposing redeemable codes. Anything else 404s without revealing whether the
 * offer exists. Rate-limited by the router-level apiLimiter like every offers
 * route; requires only catalog.view (read-only, non-sensitive).
 */
router.get(
  '/:offerId/inventory/counts',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContextWithPermission(req, 'catalog.view');
      const db = await getMongoDb();
      const { nexusOffers } = getSupplyDomainCollections(db);
      const offer = await nexusOffers.findOne(
        { offerId: req.params.offerId, ...NOT_DELETED },
        { projection: { createdByTenantId: 1, visibility: 1, status: 1 } },
      );
      const visible =
        !!offer &&
        (ctx.isPlatformAdmin === true ||
          offer.createdByTenantId === ctx.tenantId ||
          (offer.visibility === 'ecosystem' && offer.status === 'active'));
      if (!visible) {
        res.status(404).json({ error: 'Offer not found' });
        return;
      }
      // Counts + per-variant validity batches ride one response: both are
      // numbers/dates only (never code values), sharing the same exposure
      // envelope, and the variant table consumes them together.
      const [counts, validity] = await Promise.all([
        getOfferVariantInventoryCounts(req.params.offerId),
        getOfferVariantValiditySummaries(req.params.offerId),
      ]);
      res.json({ counts, validity });
    } catch (err) {
      next(err);
    }
  },
);

/** Query for the management units list: date filter (range / expiring / no-window) + paging. */
const unitListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  expiringWithin: z.enum(['1m', '3m', '1y']).optional(),
  noWindow: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  updatedFrom: z.coerce.date().optional(),
  updatedTo: z.coerce.date().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

/**
 * GET /api/v1/offers/:offerId/variants/:variantId/inventory/units
 * Paged, date-filterable list of a variant's units for the management surface.
 * Authorization: supply.manage_offers; ownership enforced; voucher-only.
 */
router.get(
  '/:offerId/variants/:variantId/inventory/units',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = unitListQuerySchema.safeParse(req.query);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const guard = await loadOwnedVoucherForInventory(req.params.offerId, ctx);
      if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
      if (!guard.variants.some((v) => v.variantId === req.params.variantId)) {
        res.status(404).json({ error: 'Variant not found on this offer' });
        return;
      }
      const { page, pageSize, ...filter } = parsed.data;
      const result = await listVariantUnits(req.params.offerId, req.params.variantId, filter, page, pageSize);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH body: the validity to set on one unit (for its variant's effective type). */
const unitValidityPatchSchema = z.object({
  validityValue: z.coerce.number().int().positive().nullable().optional(),
  validityUnit: z.enum(VOUCHER_VALIDITY_UNITS).nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});

/** Bulk PATCH body: a list of unit ids + the one validity to stamp on all of them. */
const bulkValidityPatchSchema = unitValidityPatchSchema.extend({
  codeIds: z.array(z.string().min(1)).min(1).max(VOUCHER_INVENTORY_MAX),
});

/**
 * PATCH /api/v1/offers/:offerId/variants/:variantId/inventory  (BULK)
 * Re-stamps the validity of MANY units in one request (body carries `codeIds` +
 * the validity). Validates the validity against the variant's effective type.
 * Authorization: supply.manage_offers; ownership; voucher-only.
 */
router.patch(
  '/:offerId/variants/:variantId/inventory',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = bulkValidityPatchSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const guard = await loadOwnedVoucherForInventory(req.params.offerId, ctx);
      if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
      if (!guard.variants.some((v) => v.variantId === req.params.variantId)) { res.status(404).json({ error: 'Variant not found on this offer' }); return; }
      const { codeIds, ...validityBody } = parsed.data;
      const vr = resolveBatchValidity(validityBody);
      if (!vr.ok) { res.status(400).json({ error: vr.error, errorHe: vr.errorHe }); return; }
      const result = await updateUnitsValidity(req.params.offerId, req.params.variantId, codeIds, vr.validity);
      // Audit: report who made the change and when, alongside the per-unit from -> to.
      res.json({ ...result, updatedBy: { identityId: ctx.identityId, tenantId: ctx.tenantId }, updatedAt: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/offers/:offerId/variants/:variantId/inventory/:codeId
 * Edits ONE unit's validity (only). Rejects any attempt to change value/kind
 * (those are not in the schema). Validates the supplied validity against the
 * unit's effective type. Authorization: supply.manage_offers; ownership; voucher-only.
 */
router.patch(
  '/:offerId/variants/:variantId/inventory/:codeId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = unitValidityPatchSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const guard = await loadOwnedVoucherForInventory(req.params.offerId, ctx);
      if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
      if (!guard.variants.some((v) => v.variantId === req.params.variantId)) { res.status(404).json({ error: 'Variant not found on this offer' }); return; }
      const vr = resolveBatchValidity(parsed.data);
      if (!vr.ok) { res.status(400).json({ error: vr.error, errorHe: vr.errorHe }); return; }
      const updated = await updateUnitValidity(req.params.offerId, req.params.variantId, req.params.codeId, vr.validity);
      if (!updated) { res.status(404).json({ error: 'Inventory unit not found' }); return; }
      res.json({ unit: updated });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/offers/:offerId/variants/:variantId/inventory/:codeId
 * Removes ONE inventory unit and re-syncs the offer's derived stock.
 * Authorization: supply.manage_offers; ownership enforced; voucher-only.
 */
router.delete(
  '/:offerId/variants/:variantId/inventory/:codeId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const guard = await loadOwnedVoucherForInventory(req.params.offerId, ctx);
      if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
      if (!guard.variants.some((v) => v.variantId === req.params.variantId)) {
        res.status(404).json({ error: 'Variant not found on this offer' });
        return;
      }
      const result = await deleteUnit(req.params.offerId, req.params.variantId, req.params.codeId);
      if (!result.deleted) { res.status(404).json({ error: 'Inventory unit not found' }); return; }
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/offers/:offerId/inventory  (DEPRECATED compatibility wrapper)
 * Offer-level inventory route, retained for the pre-variant client. Resolves the
 * offer's single default variant and delegates to the variant-scoped logic.
 * 400 when the offer has zero or multiple variants (use the variant route).
 */
router.post(
  '/:offerId/inventory',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = inventorySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const guard = await loadOwnedVoucherForInventory(req.params.offerId, ctx);
      if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
      const def = resolveDefaultVariantId(guard.variants);
      if (!def.ok) { res.status(def.status).json({ error: def.error }); return; }
      const vr = resolveBatchValidity(parsed.data);
      if (!vr.ok) { res.status(400).json({ error: vr.error, errorHe: vr.errorHe }); return; }
      const result = await applyInventoryUnits(req.params.offerId, def.variantId, parsed.data, vr.validity);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/offers/:offerId/inventory  (DEPRECATED compatibility wrapper)
 * Returns the single default variant's link values + per-kind counts.
 */
router.get(
  '/:offerId/inventory',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveTenantContextWithPermission(req, 'supply.manage_offers');
      const guard = await loadOwnedVoucherForInventory(req.params.offerId, ctx);
      if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
      const def = resolveDefaultVariantId(guard.variants);
      if (!def.ok) { res.status(def.status).json({ error: def.error }); return; }
      const summary = await getInventorySummary(req.params.offerId, def.variantId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Dynamic paths last ───────────────────────────────────────────────────────

/**
 * GET /api/v1/offers/:offerId/details
 * Returns a single offer detail for the requesting tenant.
 * Offer must be visible to the tenant (ecosystem or tenant_only with matching id).
 *
 * Input: offerId as path param.
 * Output: CatalogItem for the matched offer, or 404 when not visible/found.
 */
router.get(
  '/:offerId/details',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId, isPlatformAdmin } = await resolveTenantContext(req);
      // Direct single-offer lookup: includes the tenant's OWN offers of any
      // visibility (ecosystem or tenant_only) so the edit flow works, and is not
      // limited to a page of the ecosystem-only browse view.
      const offer = await getTenantOfferDetail(tenantId, req.params.offerId, { isPlatformAdmin });
      if (!offer) {
        res.status(404).json({ error: 'Offer not found' });
        return;
      }
      res.json({ offer });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/offers/:tenantId
 * Returns the member-facing benefits catalog for a given tenant.
 * Only shows offers that have been actively adopted by that tenant.
 *
 * Gate (decision 7, 2026-07-15): active membership + active tenant
 * benefits_catalog. The member's services array is NOT consulted - join-path
 * members carry services: [] and must pass. catalog.view holders bypass the
 * membership check (they manage the catalog) but not the activation check.
 *
 * Input: tenantId as path param (used as the catalog scope, not auth context).
 * Output: array of adopted CatalogItem entries, sorted newest-first.
 */
router.get(
  '/:tenantId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.params;

      const loginUser = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        select: { id: true, email: true, fullName: true, provider: true },
      });
      if (!loginUser) {
        res.status(401).json({ error: 'User not found' });
        return;
      }
      const domainIdentity = await syncDomainIdentityForLoginUser(loginUser);
      const authCtx = await getDomainAuthorizationContext(domainIdentity.nexusIdentityId, tenantId);

      const db = await getMongoDb();
      const access = await resolveMemberCatalogAccess(db, {
        tenantId,
        nexusIdentityId: domainIdentity.nexusIdentityId,
        hasCatalogViewPermission: hasDomainPermission(authCtx, 'catalog.view'),
      });
      if (access === 'catalog_inactive') {
        res.status(403).json({ error: 'Benefits Catalog service is not activated' });
        return;
      }
      if (access === 'forbidden') {
        res.status(403).json({ error: 'You do not have access to the Benefits Catalog' });
        return;
      }

      const parsed = catalogListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      // Member view ignores approval/adoption filters even if passed - the
      // service silently discards them. We return the paginated envelope
      // under `items` for consistency with the admin endpoint; the legacy
      // `offers` key is kept as an alias so older clients keep working until
      // we decommission them.
      const result = await getMemberCatalogView(tenantId, parsed.data);
      const pages = Math.max(1, Math.ceil(result.total / parsed.data.limit));
      res.json({
        items: result.items,
        offers: result.items,
        pagination: {
          page: parsed.data.page,
          limit: parsed.data.limit,
          total: result.total,
          pages,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
