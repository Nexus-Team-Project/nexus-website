/**
 * Platform-admin business-setup approval routes (rate-limited, admin-only):
 *   GET  /                          - paginated pending tenants + submitted details
 *   GET  /pending-count             - count for the sidebar badge
 *   POST /:tenantId/approve         - approve; emails the tenant owner
 *   POST /:tenantId/deny { reason } - deny with a reason; emails the tenant owner
 *
 * Gated to platform admins (email in NEXUS_ADMIN_EMAILS) via resolveTenantContext.
 * The acting admin's email (from the access token) is recorded on the review.
 * A thrown ZodError -> 400 and createError(...,404) -> 404 via the shared errorHandler.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { resolveTenantContext } from '../utils/resolve-tenant-context';
import {
  listPendingBusinessSetups,
  countPendingBusinessSetups,
  approveBusinessSetup,
  denyBusinessSetup,
} from '../services/business-setup-approval.service';

const router = Router();
router.use(apiLimiter);

// Platform-admin gate for every route in this router.
router.use(authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = await resolveTenantContext(req);
    if (!ctx.isPlatformAdmin) { res.status(403).json({ error: 'forbidden' }); return; }
    next();
  } catch (e) {
    next(e);
  }
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listPendingBusinessSetups(listQuery.parse(req.query)));
  } catch (e) {
    next(e);
  }
});

router.get('/pending-count', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ count: await countPendingBusinessSetups() });
  } catch (e) {
    next(e);
  }
});

router.post('/:tenantId/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await approveBusinessSetup(req.params.tenantId, req.user?.email ?? 'unknown-admin');
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

const denyBody = z.object({ reason: z.string().trim().min(10).max(1000) });

router.post('/:tenantId/deny', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = denyBody.parse(req.body);
    await denyBusinessSetup(req.params.tenantId, reason, req.user?.email ?? 'unknown-admin');
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
