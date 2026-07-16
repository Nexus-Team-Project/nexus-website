/**
 * GET /api/v1/wallet/contact-matches - authenticated, caller-scoped (NO tenant
 * permission). Returns the tenants whose contact lists mention the caller's
 * verified identifiers, as public branding only. Spec 7b (match screen).
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { getIdentityDomainCollections } from '../models/domain';
import { findContactMatchTenants } from '../services/wallet/contact-match.service';

const router = Router();

// Light IP rate limit (100 req/min/IP), same layer every wallet route uses.
router.use(apiLimiter);

router.get('/contact-matches', authenticate, async (req: Request, res: Response) => {
  try {
    const email = req.user!.email.toLowerCase().trim();
    const db = await getMongoDb();
    const { nexusIdentities } = getIdentityDomainCollections(db);
    const identity = await nexusIdentities.findOne(
      { normalizedEmail: email },
      { projection: { nexusIdentityId: 1, normalizedEmail: 1, phone: 1, phoneVerifiedAt: 1 } },
    );
    if (!identity) {
      res.status(404).json({ error: 'identity_not_found' });
      return;
    }
    const tenants = await findContactMatchTenants(db, {
      nexusIdentityId: identity.nexusIdentityId,
      // Session email is verified by every wallet auth flow; phone counts
      // only when the caller OTP-verified it (phoneVerifiedAt set).
      normalizedEmail: identity.normalizedEmail,
      ...(identity.phone && identity.phoneVerifiedAt ? { phone: identity.phone } : {}),
    });
    res.json({ tenants });
  } catch (e) {
    console.error('[wallet-contact-match] lookup failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
