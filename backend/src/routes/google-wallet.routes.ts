/**
 * Wallet Google login route mounted at /api/v1/auth/google/wallet.
 * Verifies a Google Identity Services id_token issued for the wallet
 * domain, resolves (or creates) the paired Prisma/Nexus identity, and
 * mints a wallet session.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { Router, Request, Response } from 'express';
import { googleWalletSchema } from '../schemas/google-wallet.schemas';
import { handleGoogleWalletLogin } from '../services/auth/google-wallet.service';
import { issueWalletSession } from '../services/auth/session-issuer.service';

const router = Router();

/** POST /api/v1/auth/google/wallet */
router.post('/', async (req: Request, res: Response) => {
  const parsed = googleWalletSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_id_token' });
    return;
  }
  try {
    const resolved = await handleGoogleWalletLogin({ idToken: parsed.data.idToken });
    const { accessToken } = await issueWalletSession(res, {
      userId: resolved.prismaUserId,
      email: resolved.email,
      role: resolved.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ accessToken, identityCreated: resolved.identityCreated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'google_token_invalid') {
      res.status(401).json({ error: 'google_token_invalid' });
      return;
    }
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
