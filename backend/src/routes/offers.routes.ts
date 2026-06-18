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
import { getMongoDb } from '../config/mongo';
import { prisma } from '../config/database';
import { getTenantDomainCollections } from '../models/domain';
import {
  resolveTenantContext,
  resolveTenantContextWithPermission,
} from '../utils/resolve-tenant-context';
import { createOffer, updateOffer, deleteOffer } from '../services/supply.service';
import { setTenantVoucherPrice } from '../services/tenant-pricing.service';
import { approveOffer, denyOffer } from '../services/supply-approval.service';
import {
  getTenantCatalogView,
  getMemberCatalogView,
  adoptOffer,
  excludeOffer,
} from '../services/catalog.service';
import { OFFER_CATEGORIES, OFFER_VISIBILITY, OFFER_EXECUTION_TYPES, OFFER_IMAGES_MAX, VOUCHER_VALIDITY_UNITS, SKU_MIN_LENGTH, SKU_MAX_LENGTH, SKU_REGEX, getSupplyDomainCollections } from '../models/domain/supply.models';
import { assertVoucherValidity, assertVoucherStackable } from '../services/supply-voucher.helper';
import { generateBarcodes, addLinks } from '../services/voucher-inventory.service';
import { VOUCHER_CODE_KINDS, VOUCHER_INVENTORY_MAX } from '../models/domain/voucher-codes.models';
import { syncDomainIdentityForLoginUser } from '../services/domain-identity.service';
import { getDomainAuthorizationContext, hasDomainPermission } from '../services/domain-authorization.service';
import {
  sendVoucherApprovalRequestEmail,
  sendVoucherApprovedEmail,
  sendVoucherDeniedEmail,
  sendVoucherWithdrawnEmail,
  getConfiguredAdminEmails,
} from '../services/voucher-approval-email.service';
import { getIdentityDomainCollections } from '../models/domain/identity.models';
import { getOnboardingStatus } from '../services/onboarding.service';

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

// ─── Zod schemas ─────────────────────────────────────────────────────────────

/**
 * Voucher validity duration fields shared by the create + update schemas.
 * Both are optional/nullable here; the cross-field rule (both-or-neither) and
 * the per-unit ceiling are enforced in the handlers via assertVoucherValidity
 * so we can return clean bilingual errors. Empty string from multipart is
 * coerced to null so "field present but blank" means "no expiry".
 */
const voucherValiditySchemaFields = {
  voucherValidityValue: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().positive().nullable().optional(),
  ),
  voucherValidityUnit: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.enum(VOUCHER_VALIDITY_UNITS).nullable().optional(),
  ),
};

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
const catalogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  category: z.enum(OFFER_CATEGORIES).optional(),
  approvalStatus: z.enum(['active', 'pending_approval', 'denied', 'expired']).optional(),
  adoptionStatus: z.enum(['adopted', 'not_adopted']).optional(),
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
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'expiry_soon', 'expiry_far']).optional(),
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
  visibility: z.enum(OFFER_VISIBILITY).default('ecosystem'),
  executionType: z.enum(OFFER_EXECUTION_TYPES).default('voucher'),
  stockLimit: z.coerce.number().int().positive().nullable().optional().default(null),
  implementationLink: z.string().url().nullable().optional(),
  implementationInstructions: z.string().max(1000).optional(),
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
  // Voucher redemption window (amount + unit). Validated cross-field in handler.
  ...voucherValiditySchemaFields,
  // Voucher combine-with-promotions + background color (voucher-only).
  ...voucherBackgroundStackableFields,
  terms: z.string().max(2000).optional(),
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
  executionType: z.enum(OFFER_EXECUTION_TYPES).optional(),
  // Empty string from the multipart edit form means "no value / clear it".
  // Map it to null before validation so an untouched empty field does not 400.
  stockLimit: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().positive().nullable().optional()),
  implementationLink: z.preprocess((v) => (v === '' ? null : v), z.string().url().nullable().optional()),
  implementationInstructions: z.string().max(1000).optional(),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  // Voucher redemption window (amount + unit). Validated cross-field in handler.
  ...voucherValiditySchemaFields,
  // Voucher combine-with-promotions + background color (voucher-only).
  ...voucherBackgroundStackableFields,
  terms: z.string().max(2000).optional(),
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
});

/**
 * Validates the body for setting a tenant's per-offer voucher member price.
 * memberPrice is coerced from string to support form-data submissions while
 * the dominant client (dashboard) sends JSON.
 */
const setTenantVoucherPriceSchema = z.object({
  memberPrice: z.coerce.number().positive(),
});

/**
 * Validates the voucher inventory body. `kind` selects barcode generation
 * (needs `quantity`) or link entry (needs `links`); the per-kind requirement is
 * cross-checked in the handler. Quantity + link count are capped server-side.
 */
const inventorySchema = z.object({
  kind: z.enum(VOUCHER_CODE_KINDS),
  quantity: z.coerce.number().int().min(1).max(VOUCHER_INVENTORY_MAX).optional(),
  links: z.array(z.string().url()).min(1).max(VOUCHER_INVENTORY_MAX).optional(),
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
      const ctx = await resolveTenantContextWithPermission(req, 'catalog.view');
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

      // Platform admins always create ecosystem-wide offers regardless of what
      // the client sends. This prevents accidentally scoping supply to a single tenant.
      const finalVisibility = ctx.isPlatformAdmin ? 'ecosystem' : parsed.data.visibility;

      // Ecosystem offers require business setup to be complete so the tenant has
      // a valid business profile before advertising to the entire platform.
      // Uses getOnboardingStatus (same logic as /api/me) for consistency across all tenant types.
      if (finalVisibility === 'ecosystem' && !ctx.isPlatformAdmin) {
        const { onboarding } = await getOnboardingStatus(req.user!.sub);
        if (onboarding.step === 'business_setup') {
          res.status(403).json({
            error: 'Complete your business setup before publishing offers to the ecosystem',
            errorHe: 'יש להשלים את הגדרת העסק לפני פרסום הצעות לכל הפלטפורמה',
          });
          return;
        }
      }

      // Cross-field validation for voucher pricing.
      // These checks cannot be expressed in Zod without knowing the final visibility.
      const d = parsed.data;
      if (d.executionType === 'voucher') {
        if (!d.face_value || !d.nexus_cost) {
          res.status(400).json({ error: 'Voucher offers require face_value and nexus_cost' });
          return;
        }
        if (d.nexus_cost >= d.face_value) {
          res.status(400).json({ error: 'nexus_cost must be less than face_value' });
          return;
        }
        if (d.member_price !== undefined && (d.member_price < d.nexus_cost || d.member_price > d.face_value)) {
          res.status(400).json({ error: 'member_price must be between nexus_cost and face_value (inclusive)' });
          return;
        }
      }

      // Voucher cross-field checks. Apply only to vouchers.
      if (d.executionType === 'voucher') {
        const v = assertVoucherValidity(d.voucherValidityValue, d.voucherValidityUnit);
        if (!v.ok) {
          res.status(400).json({ error: v.error, errorHe: v.errorHe });
          return;
        }
        // Combine-with-promotions is a mandatory, no-default choice for vouchers.
        const s = assertVoucherStackable(d.voucherStackable);
        if (!s.ok) {
          res.status(400).json({ error: s.error, errorHe: s.errorHe });
          return;
        }
      }

      // Voucher single-image rule: a voucher carries exactly one card image.
      // multer already caps total file count at OFFER_IMAGES_MAX; this narrows
      // it to 1 for vouchers. Re-enforced server-side regardless of the UI.
      const uploadedFileCount = Array.isArray(req.files) ? req.files.length : 0;
      if (d.executionType === 'voucher' && uploadedFileCount > 1) {
        res.status(400).json({
          error: 'A voucher offer can have at most one image',
          errorHe: 'שובר יכול לכלול תמונה אחת בלבד',
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
      const { keptImageUrls: _ignoredKept, ...createPayload } = restParsed;
      const offer = await createOffer({
        ...createPayload,
        visibility: finalVisibility,
        validFrom: validFromDate,
        validUntil: validUntilDate,
        imageFiles,
        createdByTenantId: ctx.tenantId,
        createdByIdentityId: ctx.identityId,
      });

      // Auto-adopt tenant_only offers for the creating tenant so the offer
      // appears in their catalog immediately without a manual toggle.
      if (offer.visibility === 'tenant_only') {
        try {
          await adoptOffer(ctx.tenantId, offer.offerId, ctx.identityId);
        } catch (err) {
          // Log but do not fail the response - offer was created successfully.
          console.error('[OFFERS] Auto-adopt failed for tenant_only offer:', err);
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

      // Voucher pricing lock: face_value + nexus_cost reflect the deal agreed
      // between Nexus and the supplier. Only a platform admin may change them
      // post-creation. Non-admin callers attempting to send either field on a
      // voucher offer get rejected here (frontend already disables the inputs;
      // this is the defense-in-depth gate).
      if (!ctx.isPlatformAdmin
          && (parsed.data.face_value !== undefined || parsed.data.nexus_cost !== undefined)) {
        res.status(403).json({ error: 'voucher_pricing_locked' });
        return;
      }

      // Convert validFrom/validUntil ISO strings (from multipart form) to Date objects.
      const { validFrom: validFromStr, validUntil: validUntilStr, ...restParsed } = parsed.data;
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
      // Belt+suspenders cap: kept + new uploaded must not exceed OFFER_IMAGES_MAX.
      // multer already caps file count, but kept can be sent without files.
      const keptCount = restParsed.keptImageUrls?.length ?? 0;
      if (keptCount + imageFiles.length > OFFER_IMAGES_MAX) {
        res.status(400).json({
          error: `An offer can have at most ${OFFER_IMAGES_MAX} images.`,
        });
        return;
      }
      // Voucher single-image rule. The frontend always sends executionType on
      // save; when it indicates a voucher, kept + uploaded must be at most 1.
      if (restParsed.executionType === 'voucher' && keptCount + imageFiles.length > 1) {
        res.status(400).json({
          error: 'A voucher offer can have at most one image',
          errorHe: 'שובר יכול לכלול תמונה אחת בלבד',
        });
        return;
      }
      // Voucher cross-field checks on update.
      if (restParsed.executionType === 'voucher') {
        const v = assertVoucherValidity(restParsed.voucherValidityValue, restParsed.voucherValidityUnit);
        if (!v.ok) {
          res.status(400).json({ error: v.error, errorHe: v.errorHe });
          return;
        }
        const s = assertVoucherStackable(restParsed.voucherStackable);
        if (!s.ok) {
          res.status(400).json({ error: s.error, errorHe: s.errorHe });
          return;
        }
      }
      const { keptImageUrls, ...restNoKept } = restParsed;
      const result = await updateOffer(req.params.offerId, ctx.tenantId, {
        ...restNoKept,
        ...(validFromDate !== undefined && { validFrom: validFromDate }),
        ...(validUntilDate !== undefined && { validUntil: validUntilDate }),
        imageFiles,
        ...(keptImageUrls !== undefined && { keptImageUrls }),
      });

      if (!result) {
        res.status(404).json({ error: 'Offer not found or you do not own this offer' });
        return;
      }

      const { offer, wasResubmitted, wasUpdatedWhilePending } = result;

      // Notify admins when a denied offer is resubmitted OR when a pending offer is updated.
      // Both cases require admins to re-review; isUpdate distinguishes the subject line.
      if (wasResubmitted || wasUpdatedWhilePending) {
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

      // If the offer was pending admin review, notify them that it was withdrawn.
      if (deletedOffer.status === 'pending_approval') {
        const adminEmails = getConfiguredAdminEmails();
        try {
          const db = await getMongoDb();
          const tenantCollections = getTenantDomainCollections(db);
          const tenantDoc = await tenantCollections.domainTenants.findOne({ tenantId: ctx.tenantId });
          const supplierName = tenantDoc?.organizationName ?? ctx.tenantId;
          sendVoucherWithdrawnEmail(adminEmails, deletedOffer, supplierName).catch((err) => {
            console.error('[OFFERS] Withdrawn email failed:', err);
          });
        } catch (err) {
          console.error('[OFFERS] Could not resolve supplier name for withdrawn email:', err);
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
 * Business rule: the tenant must have completed business setup before adopting
 * offers. Uses getOnboardingStatus (same logic as /api/me) so the check is
 * consistent for all tenant types and survives future identity model changes.
 *
 * Input: offerId as path param.
 * Output: { success: true } on adoption.
 *         403 when business setup is not yet submitted.
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

      // Business setup is only required when adopting another tenant's offer.
      // Tenants can always adopt their own offers (e.g. re-adopting a tenant_only
      // offer after unadopting it) regardless of setup status.
      const db = await getMongoDb();
      const { nexusOffers } = getSupplyDomainCollections(db);
      const targetOffer = await nexusOffers.findOne(
        { offerId: req.params.offerId },
        { projection: { createdByTenantId: 1 } },
      );
      const isOwnOffer = targetOffer?.createdByTenantId === tenantId;

      if (!isOwnOffer) {
        const { onboarding } = await getOnboardingStatus(req.user!.sub);
        if (onboarding.step === 'business_setup') {
          res.status(403).json({
            error: 'Complete your business setup before adopting offers',
            errorHe: 'יש להשלים את הגדרת העסק לפני אימוץ הצעות',
          });
          return;
        }
      }

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
 * Input body: { memberPrice: number } (positive).
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
        res.status(400).json({ error: 'memberPrice required and must be positive' });
        return;
      }

      const { tenantId } = await resolveTenantContextWithPermission(
        req,
        'catalog.adopt_offer',
      );

      const result = await setTenantVoucherPrice({
        tenantId,
        offerId: req.params.offerId,
        memberPrice: parsed.data.memberPrice,
      });

      if (!result.ok) {
        const code =
          result.reason === 'offer_not_found' ? 404 :
          result.reason === 'not_adopted' ? 403 :
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
 * POST /api/v1/offers/:offerId/inventory
 * Appends redeemable inventory (mock barcodes or real links) to a voucher the
 * caller owns, and resyncs the offer's stockLimit to its total unit count.
 *
 * Authorization: supply.manage_offers; ownership enforced (creating tenant or
 * platform admin). Voucher-only. Quantities capped server-side.
 *
 * Input body: { kind: 'barcode' | 'link', quantity?: int, links?: url[] }.
 * Output: { created, stockLimit }.
 *   404 - offer not found / not owned
 *   400 - non-voucher, or missing the field required for the chosen kind
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

      // Ownership + voucher-only guard.
      const db = await getMongoDb();
      const { nexusOffers } = getSupplyDomainCollections(db);
      const offer = await nexusOffers.findOne(
        { offerId: req.params.offerId },
        { projection: { createdByTenantId: 1, executionType: 1 } },
      );
      if (!offer || (!ctx.isPlatformAdmin && offer.createdByTenantId !== ctx.tenantId)) {
        res.status(404).json({ error: 'Offer not found or you do not own this offer' });
        return;
      }
      if (offer.executionType !== 'voucher') {
        res.status(400).json({ error: 'Inventory is only supported for voucher offers' });
        return;
      }

      const { kind, quantity, links } = parsed.data;
      let result;
      if (kind === 'barcode') {
        if (quantity === undefined) {
          res.status(400).json({ error: 'quantity is required to generate barcodes' });
          return;
        }
        result = await generateBarcodes(req.params.offerId, quantity);
      } else {
        if (!links || links.length === 0) {
          res.status(400).json({ error: 'links is required to add link inventory' });
          return;
        }
        result = await addLinks(req.params.offerId, links);
      }

      res.status(201).json(result);
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
      const { tenantId } = await resolveTenantContext(req);
      // Detail view: fetch a single page large enough that the target offer
      // will be on it for typical catalogs. We pass page=1, limit=100 so the
      // existing in-memory find works without changing the contract. Once we
      // have a dedicated single-offer endpoint we can drop this.
      const result = await getTenantCatalogView(tenantId, { page: 1, limit: 100 });
      const offer = result.items.find((i) => i.offerId === req.params.offerId);
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
 * Gate: the benefits_catalog service must be active for the requested tenant.
 * Returns 403 when the service has not been activated yet.
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

      // Guard: benefits_catalog service must be active for this tenant before
      // exposing the member-facing catalog. This prevents tenants that have not
      // activated the service from having their catalog accessed.
      const db = await getMongoDb();
      const tenantCollections = getTenantDomainCollections(db);
      const serviceActive = await tenantCollections.tenantServiceActivations.findOne({
        tenantId,
        serviceKey: 'benefits_catalog',
        status: 'active',
      });
      if (!serviceActive) {
        res.status(403).json({ error: 'Benefits Catalog service is not activated' });
        return;
      }

      // Guard: member-level access check.
      // Admins with catalog.view permission bypass this check — they manage the catalog.
      // Regular members must have been explicitly invited with benefits_catalog in their
      // services array to browse and purchase offers.
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
      const isAdminOrManager = hasDomainPermission(authCtx, 'catalog.view');

      if (!isAdminOrManager) {
        // Regular member: verify they were invited with catalog access.
        const memberDoc = await tenantCollections.tenantMembers.findOne({
          tenantId,
          nexusIdentityId: domainIdentity.nexusIdentityId,
        });
        const memberHasCatalog =
          Array.isArray(memberDoc?.services) &&
          memberDoc.services.includes('benefits_catalog');
        if (!memberHasCatalog) {
          res.status(403).json({ error: 'You do not have access to the Benefits Catalog' });
          return;
        }
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
