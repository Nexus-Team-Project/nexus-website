/**
 * Wallet tenant-rating routes.
 *
 * GET /api/v1/wallet/tenants/:tenantId/rating/mine - the caller's own rating
 * POST /api/v1/wallet/tenants/:tenantId/rating     - submit/update own rating
 *
 * Any authenticated wallet user may rate any tenant (no membership or
 * permission gate - this is the caller's own action on their own identity,
 * matching the join-request/contact-match precedent in wallet-tenants.routes.ts).
 * The aggregate is public and reads through public-tenant.service.ts instead.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { getIdentityDomainCollections } from '../models/domain';
import { getMyTenantRating, submitTenantRating } from '../services/wallet/tenant-rating.service';

const router = Router();

router.use(apiLimiter);

const tenantIdSchema = z.string().min(1).max(128);
const ratingBodySchema = z.object({ rating: z.number().int().min(1).max(5) });

async function getCallingNexusIdentityId(req: Request): Promise<string | null> {
  const email = req.user!.email.toLowerCase().trim();
  const db = await getMongoDb();
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const doc = await nexusIdentities.findOne(
    { normalizedEmail: email },
    { projection: { nexusIdentityId: 1 } },
  );
  return doc?.nexusIdentityId ?? null;
}

router.get('/tenants/:tenantId/rating/mine', authenticate, async (req: Request, res: Response) => {
  const parsed = tenantIdSchema.safeParse(req.params.tenantId);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_tenant_id' });
    return;
  }
  try {
    const nexusIdentityId = await getCallingNexusIdentityId(req);
    if (!nexusIdentityId) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    const rating = await getMyTenantRating(db, { tenantId: parsed.data, nexusIdentityId });
    res.json({ rating });
  } catch (e) {
    console.error('[wallet-tenant-rating] get-mine failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/tenants/:tenantId/rating', authenticate, async (req: Request, res: Response) => {
  const tenantIdParsed = tenantIdSchema.safeParse(req.params.tenantId);
  const bodyParsed = ratingBodySchema.safeParse(req.body);
  if (!tenantIdParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const nexusIdentityId = await getCallingNexusIdentityId(req);
    if (!nexusIdentityId) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const db = await getMongoDb();
    await submitTenantRating(db, {
      tenantId: tenantIdParsed.data,
      nexusIdentityId,
      rating: bodyParsed.data.rating as 1 | 2 | 3 | 4 | 5,
    });
    res.json({ rating: bodyParsed.data.rating });
  } catch (e) {
    console.error('[wallet-tenant-rating] submit failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
