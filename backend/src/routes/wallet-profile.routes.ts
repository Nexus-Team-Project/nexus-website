/**
 * /api/v1/wallet/profile + /api/v1/wallet/marketing-consent routes.
 * Both require a valid Bearer access token (authenticate middleware).
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getMongoDb } from '../config/mongo';
import {
  walletProfilePatchSchema,
  walletMarketingConsentSchema,
} from '../schemas/wallet-profile.schemas';
import {
  getWalletProfile,
  patchWalletProfile,
  setWalletMarketingConsent,
} from '../services/wallet/wallet-profile.service';

const router = Router();

/**
 * GET /api/v1/wallet/profile
 * Returns the wallet profile sub-doc or null when not yet started.
 */
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const email = req.user!.email;
    const db = await getMongoDb();
    const view = await getWalletProfile(db, { prismaUserId: userId, email });
    res.json({ profile: view });
  } catch (e) {
    console.error('[wallet-profile] GET failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * PATCH /api/v1/wallet/profile
 * Body: any subset of profile fields + optional complete: true.
 */
router.patch('/profile', authenticate, async (req: Request, res: Response) => {
  const parsed = walletProfilePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_profile' });
    return;
  }
  try {
    const userId = req.user!.sub;
    const email = req.user!.email;
    const db = await getMongoDb();
    const view = await patchWalletProfile(db, {
      prismaUserId: userId,
      email,
      patch: parsed.data,
    });
    res.json({ profile: view });
  } catch (e) {
    console.error('[wallet-profile] PATCH failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * PATCH /api/v1/wallet/marketing-consent
 * Writes the audit-trail object. grantedAt is preserved across toggles.
 */
router.patch('/marketing-consent', authenticate, async (req: Request, res: Response) => {
  const parsed = walletMarketingConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_consent' });
    return;
  }
  try {
    const userId = req.user!.sub;
    const email = req.user!.email;
    const db = await getMongoDb();
    await setWalletMarketingConsent(db, {
      prismaUserId: userId,
      email,
      body: parsed.data,
      ip: req.ip,
    });
    res.status(204).end();
  } catch (e) {
    console.error('[wallet-profile] marketing-consent failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
