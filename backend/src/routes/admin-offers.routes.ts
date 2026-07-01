/**
 * Platform-admin offer routes (rate-limited, admin-only):
 *   GET /api/v1/admin/offers/pending-count - number of offers awaiting approval.
 *
 * Gated to platform admins (email in NEXUS_ADMIN_EMAILS) via resolveTenantContext.
 * Read-only + cheap (a single countDocuments), used for the admin sidebar badge.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { resolveTenantContext } from '../utils/resolve-tenant-context';
import { countPendingApprovalOffers } from '../services/supply-approval.service';

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

router.get('/pending-count', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ count: await countPendingApprovalOffers() });
  } catch (e) {
    next(e);
  }
});

export default router;
