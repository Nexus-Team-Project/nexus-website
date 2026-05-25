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
import {
  handleGoogleWalletLogin,
  handleGoogleWalletCode,
} from '../services/auth/google-wallet.service';
import { issueWalletSession } from '../services/auth/session-issuer.service';

const router = Router();

/** POST /api/v1/auth/google/wallet - { idToken } OR { code, redirectUri } */
router.post('/', async (req: Request, res: Response) => {
  const parsed = googleWalletSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_id_token' });
    return;
  }
  try {
    const resolved = parsed.data.idToken
      ? await handleGoogleWalletLogin({ idToken: parsed.data.idToken })
      : await handleGoogleWalletCode({
          code: parsed.data.code as string,
          redirectUri: parsed.data.redirectUri as string,
        });
    const { accessToken } = await issueWalletSession(res, {
      userId: resolved.prismaUserId,
      email: resolved.email,
      role: resolved.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // Plan #1.5: auto-accept any pending invitations matching this email.
    let acceptedTenantIds: string[] = [];
    try {
      const { reconcilePendingInvitations } = await import(
        '../services/auth/wallet-invitation-reconcile.service'
      );
      const { getMongoDb } = await import('../config/mongo');
      const { getIdentityDomainCollections } = await import('../models/domain');
      const db = await getMongoDb();
      const { nexusIdentities } = getIdentityDomainCollections(db);
      const identity = await nexusIdentities.findOne(
        { normalizedEmail: resolved.email },
        { projection: { nexusIdentityId: 1 } },
      );
      if (identity) {
        const reconciled = await reconcilePendingInvitations(db, {
          nexusIdentityId: identity.nexusIdentityId,
          email: resolved.email,
        });
        acceptedTenantIds = reconciled.acceptedTenantIds;
      }
    } catch (reconcileErr) {
      console.error('[wallet-auth] reconcile failed (non-fatal):', reconcileErr);
    }
    res.json({
      accessToken,
      identityCreated: resolved.identityCreated,
      acceptedTenantIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'google_token_invalid') {
      res.status(401).json({ error: 'google_token_invalid' });
      return;
    }
    if (msg === 'google_not_configured') {
      res.status(503).json({ error: 'google_not_configured' });
      return;
    }
    console.error('[google-wallet] failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
