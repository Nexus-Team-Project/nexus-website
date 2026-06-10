/**
 * Public (no-auth) routes. Currently exposes tenant public info so an
 * anonymous wallet visitor on a ?tenant=X link can render the real org
 * name/logo. Mounted at /api/v1/public. NO authenticate middleware here.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getMongoDb } from '../config/mongo';
import { getPublicTenantInfo } from '../services/public/public-tenant.service';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Unauthenticated + hits Mongo on every call. Rate-limit (100 req/min/IP) to
// blunt tenant-id enumeration and DoS.
router.use(apiLimiter);

const tenantIdSchema = z.string().min(1).max(128);

/**
 * GET /api/v1/public/tenants/:tenantId
 * 200 { tenantId, organizationName, logoUrl? } when the tenant has an
 * active benefits_catalog activation; 404 otherwise.
 */
router.get('/tenants/:tenantId', async (req: Request, res: Response) => {
  const parsed = tenantIdSchema.safeParse(req.params.tenantId);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_tenant_id' });
  }
  try {
    const db = await getMongoDb();
    const info = await getPublicTenantInfo(db, parsed.data);
    if (!info) return res.status(404).json({ error: 'tenant_not_found' });
    return res.json(info);
  } catch (err) {
    console.error('[public-tenant] lookup failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
