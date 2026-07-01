/**
 * Platform-admin trusted-tenants routes (rate-limited, admin-only):
 *   GET   /api/v1/admin/tenants                        - list all tenants (paginated) + pending counts
 *   PATCH /api/v1/admin/tenants/:tenantId/auto-approve - { enabled } toggle; enable retro-approves pending
 *
 * Gated to platform admins (email in NEXUS_ADMIN_EMAILS) via resolveTenantContext.
 * A thrown ZodError -> 400 and createError(...,404) -> 404 via the shared errorHandler.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { resolveTenantContext } from '../utils/resolve-tenant-context';
import { listAllTenants, setTenantAutoApprove } from '../services/admin-tenants.service';

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
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listQuery.parse(req.query);
    res.json(await listAllTenants(q));
  } catch (e) {
    next(e);
  }
});

const toggleBody = z.object({ enabled: z.boolean() });

router.patch('/:tenantId/auto-approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled } = toggleBody.parse(req.body);
    res.json(await setTenantAutoApprove(req.params.tenantId, enabled));
  } catch (e) {
    next(e);
  }
});

export default router;
