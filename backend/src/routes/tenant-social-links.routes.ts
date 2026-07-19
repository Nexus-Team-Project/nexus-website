/**
 * Tenant social-media handle routes (Instagram/Facebook/X).
 *
 *   PATCH /api/v1/tenant/social-links - JSON, each field independently
 *     optional: `{ instagramHandle?, facebookHandle?, twitterHandle? }`.
 *     A value may be a bare handle, an `@handle`, or a full pasted profile
 *     URL - all reduce to the same stored handle. `null` (or an empty
 *     string) clears that field; an absent key leaves it unchanged.
 *
 * Gated by the same `workspace.update_settings` permission as the tenant
 * logo/cover/brand-color routes; the tenant id is derived from the caller's
 * membership, never trusted from the client. A thrown ZodError -> 400 via
 * the shared errorHandler - not hand-handled here.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { resolveTenantContextWithPermission } from '../utils/resolve-tenant-context';
import { tenantSocialLinksBodySchema } from '../schemas/socialHandle.schemas';
import { setTenantSocialLinks } from '../services/tenant-social-links.service';

const router = Router();

router.use(apiLimiter);

router.patch('/social-links', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const body = tenantSocialLinksBodySchema.parse(req.body);
    const db = await getMongoDb();
    const out = await setTenantSocialLinks(db, { tenantId, ...body });
    res.json(out);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 403) { res.status(403).json({ error: 'forbidden' }); return; }
    if (status === 401) { res.status(401).json({ error: 'unauthorized' }); return; }
    next(e);
  }
});

export default router;
