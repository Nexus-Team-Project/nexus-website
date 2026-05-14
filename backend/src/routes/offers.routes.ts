/**
 * Offers routes - HTTP handlers for all offer-related endpoints.
 *
 * Route names match openapi.json paths exactly with /v1/ prefix.
 * Static path segments (/platform, /status, /stats, /barcodes) are registered
 * BEFORE dynamic /:offerId patterns to prevent Express catching them as offer ids.
 *
 * Authorization: supply/catalog permissions are checked inline via
 * resolveTenantContextWithPermission rather than the requireDomainPermission
 * middleware. This is required because the middleware resolves roles with a null
 * tenantId when no :tenantId param exists in the URL, which would find no
 * tenant-scoped role assignments and incorrectly deny all users.
 *
 * Security: raw_cost is stripped from all API responses before sending to clients.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import {
  resolveTenantContext,
  resolveTenantContextWithPermission,
} from '../utils/resolve-tenant-context';
import { createOffer, updateOffer, deleteOffer } from '../services/supply.service';
import {
  getTenantCatalogView,
  getMemberCatalogView,
  adoptOffer,
  excludeOffer,
} from '../services/catalog.service';
import { OFFER_CATEGORIES, OFFER_VISIBILITY } from '../models/domain/supply.models';
import type { NexusOffer } from '../models/domain/supply.models';

const router = Router();

/**
 * Multer upload instance configured for in-memory storage.
 * Limits file size to 5 MB to prevent abuse.
 * Files are held in memory as Buffer and forwarded to Cloudinary upload.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ─── Zod schemas ─────────────────────────────────────────────────────────────

/**
 * Validates the body for creating a new offer.
 * Numeric fields use coerce to handle multipart/form-data string values.
 */
const createOfferSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  category: z.enum(OFFER_CATEGORIES),
  raw_cost: z.coerce.number().positive(),
  market_price: z.coerce.number().positive().optional(),
  visibility: z.enum(OFFER_VISIBILITY).default('ecosystem'),
});

/**
 * Validates the body for updating an existing offer.
 * All fields are optional - only provided fields will be updated.
 */
const updateOfferSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  raw_cost: z.coerce.number().positive().optional(),
  market_price: z.coerce.number().positive().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Strips raw_cost from an offer document before sending to the client.
 * This is a security guard - raw provider cost must never leave the backend.
 *
 * Input:  offer - full NexusOffer document including raw_cost.
 * Output: offer fields with raw_cost omitted.
 */
function stripRawCost(offer: NexusOffer): Omit<NexusOffer, 'raw_cost'> {
  const { raw_cost: _rc, ...safeOffer } = offer;
  return safeOffer;
}

// ─── Static paths first ───────────────────────────────────────────────────────
// These MUST be registered before /:offerId to prevent Express route conflicts.

/**
 * GET /api/v1/offers/platform
 * Returns all visible platform offers with per-tenant adoption status.
 * Used by the admin Benefits & Partnerships page.
 * Requires: catalog.view permission.
 */
router.get(
  '/platform',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = await resolveTenantContextWithPermission(req, 'catalog.view');
      const category =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const items = await getTenantCatalogView(tenantId, category);
      res.json({ items });
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
 * Input body (multipart or JSON):
 *   title, description, category, raw_cost, market_price (optional), visibility
 * Input file (optional): image field, max 5 MB.
 * Output: created offer with raw_cost stripped.
 */
router.post(
  '/',
  authenticate,
  upload.single('image'),
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

      const offer = await createOffer({
        ...parsed.data,
        visibility: finalVisibility,
        imageBuffer: req.file?.buffer,
        imageFilename: req.file?.originalname,
        createdByTenantId: ctx.tenantId,
        createdByIdentityId: ctx.identityId,
      });

      res.status(201).json({ offer: stripRawCost(offer) });
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
 * Input body (multipart or JSON): any subset of title, description, raw_cost,
 *   market_price, status.
 * Input file (optional): image field, max 5 MB.
 * Output: updated offer with raw_cost stripped, or 404 when not found / not owned.
 */
router.patch(
  '/:offerId',
  authenticate,
  upload.single('image'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = updateOfferSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const { tenantId } = await resolveTenantContextWithPermission(
        req,
        'supply.manage_offers',
      );

      const offer = await updateOffer(req.params.offerId, tenantId, {
        ...parsed.data,
        imageBuffer: req.file?.buffer,
        imageFilename: req.file?.originalname,
      });

      if (!offer) {
        res.status(404).json({ error: 'Offer not found' });
        return;
      }

      res.json({ offer: stripRawCost(offer) });
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
      await deleteOffer(req.params.offerId, ctx.tenantId, ctx.isPlatformAdmin ?? false);
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
      const items = await getTenantCatalogView(tenantId);
      const offer = items.find((i) => i.offerId === req.params.offerId);
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
 * Input: tenantId as path param (used as the catalog scope, not auth context).
 * Output: array of adopted CatalogItem entries, sorted newest-first.
 */
router.get(
  '/:tenantId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Use the URL param tenantId as the catalog scope for member-facing view.
      const category =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const items = await getMemberCatalogView(req.params.tenantId, category);
      res.json({ offers: items });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
