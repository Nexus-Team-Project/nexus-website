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

export default router;
