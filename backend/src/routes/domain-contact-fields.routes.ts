/**
 * Tenant contact custom-column (field-definition) routes.
 * Read requires members.view; writes require members.update - enforced inside
 * each service via requireTenantMemberPermission, so tenant context comes from
 * the token, never the request body.
 *
 *   GET    /api/v1/tenant/contact-fields          - list columns
 *   POST   /api/v1/tenant/contact-fields          - create a column
 *   PATCH  /api/v1/tenant/contact-fields/reorder  - reorder columns
 *   PATCH  /api/v1/tenant/contact-fields/:fieldId - rename a column
 *   DELETE /api/v1/tenant/contact-fields/:fieldId - delete a column + its values
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  createContactFieldSchema,
  renameContactFieldSchema,
  reorderContactFieldsSchema,
} from '../schemas/domain-contact-fields.schemas';
import {
  listContactFields,
  createContactField,
  renameContactField,
  deleteContactField,
  reorderContactFields,
} from '../services/domain-contact-fields.service';

const router = Router();

router.get('/', authenticate, apiLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ fields: await listContactFields(req.user!.sub) });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, apiLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = createContactFieldSchema.parse(req.body);
    res.status(201).json(await createContactField(req.user!.sub, input));
  } catch (error) {
    next(error);
  }
});

// Reorder must be registered before the ':fieldId' route so it is not captured.
router.patch('/reorder', authenticate, apiLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = reorderContactFieldsSchema.parse(req.body);
    res.json({ fields: await reorderContactFields(req.user!.sub, input) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:fieldId', authenticate, apiLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = renameContactFieldSchema.parse(req.body);
    res.json(await renameContactField(req.user!.sub, req.params.fieldId, input));
  } catch (error) {
    next(error);
  }
});

router.delete('/:fieldId', authenticate, apiLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json(await deleteContactField(req.user!.sub, req.params.fieldId));
  } catch (error) {
    next(error);
  }
});

export default router;
