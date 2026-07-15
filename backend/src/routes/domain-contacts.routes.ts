/**
 * Protected tenant contact CRUD and bulk import routes.
 * All routes require a valid Bearer token. Read routes require member.view;
 * write routes require member.manage — enforced inside each service call via
 * requireTenantMemberPermission so tenant context is derived from the token,
 * never from the request body.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  listContactsQuerySchema,
  createContactSchema,
  updateContactSchema,
  importContactsSchema,
} from '../schemas/domain-contacts.schemas';
import {
  listTenantContacts,
  createTenantContact,
  updateTenantContact,
  importTenantContacts,
} from '../services/domain-contacts.service';
import { outreachEnqueueSchema, outreachPreviewSchema } from '../schemas/tenant-outreach.schemas';
import { enqueueServiceOutreach, previewServiceOutreach } from '../services/tenant-outreach.service';

const router = Router();

/**
 * GET /api/v1/tenant/contacts
 * Lists paginated tenant contacts with optional search and status filter.
 * Requires member.view permission.
 */
router.get(
  '/',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listContactsQuerySchema.parse(req.query);
      const result = await listTenantContacts(req.user!.sub, query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/tenant/contacts
 * Creates a single contact. Upserts by email if the contact already exists.
 * Requires member.manage permission.
 */
router.post(
  '/',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createContactSchema.parse(req.body);
      const result = await createTenantContact(req.user!.sub, input);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/v1/tenant/contacts/:contactId
 * Updates mutable fields on a contact. Returns 404 when the contact is not found.
 * Requires member.manage permission.
 */
router.patch(
  '/:contactId',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = updateContactSchema.parse(req.body);
      const result = await updateTenantContact(req.user!.sub, req.params.contactId, input);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/tenant/contacts/import
 * Bulk-upserts up to 2000 contacts from a CSV import payload.
 * Returns { imported, skipped, errors } counts.
 * Requires member.manage permission.
 */
router.post(
  '/import',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = importContactsSchema.parse(req.body);
      const result = await importTenantContacts(req.user!.sub, input.rows);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/tenant/contacts/outreach/preview
 * Server-computed targeting counts for the outreach confirm screen.
 * ONE $facet aggregation; flat counts response. Requires team.invite_member.
 */
router.post(
  '/outreach/preview',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = outreachPreviewSchema.parse(req.body);
      res.json(await previewServiceOutreach(req.user!.sub, input));
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/tenant/contacts/outreach
 * Enqueues a service-outreach job (SMS/email blast with the tenant's short
 * wallet link). Re-runs the preview targeting query with an _id cursor and
 * hands delivery to the invite worker. Rate-limited; team.invite_member.
 * Returns: 202 { jobId, totals: { willSend, skipped, alreadyInvitedIncluded } }
 */
router.post(
  '/outreach',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = outreachEnqueueSchema.parse(req.body);
      res.status(202).json(await enqueueServiceOutreach(req.user!.sub, input));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
