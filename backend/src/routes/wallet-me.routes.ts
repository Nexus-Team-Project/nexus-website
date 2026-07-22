/**
 * GET /api/v1/wallet/me - the wallet's slim session hydration endpoint.
 *
 * Caller-scoped (Bearer token only, no tenant permission gate needed: it
 * returns exclusively the caller's own data). Replaces the wallet's use of
 * the shared GET /api/me, which computes and exposes the full dashboard
 * payload the wallet never reads. See services/wallet/wallet-me.service.ts.
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { buildWalletMe } from '../services/wallet/wallet-me.service';

const router = Router();

router.get('/me', apiLimiter, authenticate, async (req: Request, res: Response) => {
  try {
    res.json(await buildWalletMe(req.user!.sub));
  } catch (e) {
    console.error('[wallet-me] GET failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
