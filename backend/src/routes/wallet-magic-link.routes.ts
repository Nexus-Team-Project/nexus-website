/**
 * Wallet magic-link HTTP routes mounted at /api/v1/auth/magic-link/*.
 *
 * /start emails a one-time sign-in link (always 200 {ok} - non-enumerating).
 * /consume claims the token, resolves (or creates) the paired
 * (Prisma User, NexusIdentity) via resolveWalletIdentity, mints a session,
 * and best-effort auto-accepts pending invitations. Clicking the emailed link
 * is the sole authentication factor - there is no code step.
 *
 * Spec: docs/superpowers/specs/2026-07-16-wallet-email-magic-link-auth-design.md
 */
import { Router, Request, Response } from 'express';
import { getMongoDb } from '../config/mongo';
import { magicLinkStartSchema, magicLinkConsumeSchema } from '../schemas/wallet-magic-link.schemas';
import { startMagicLink, consumeMagicLink } from '../services/auth/wallet-magic-link.service';
import { resolveWalletIdentity } from '../services/auth/wallet-identity.service';
import { issueWalletSession } from '../services/auth/session-issuer.service';
import { apiLimiter, authLimiter } from '../middleware/rateLimiter';

const router = Router();
router.use(apiLimiter);

function clientError(e: unknown): { status: number; code: string } {
  const msg = e instanceof Error ? e.message : 'unknown';
  if (msg.startsWith('rate_limited')) return { status: 429, code: 'rate_limited' };
  if (msg === 'magic_unavailable') return { status: 503, code: 'magic_unavailable' };
  if (msg === 'link_invalid') return { status: 400, code: 'link_invalid' };
  return { status: 500, code: 'internal_error' };
}

/** POST /api/v1/auth/magic-link/start */
router.post('/start', authLimiter, async (req: Request, res: Response) => {
  const parsed = magicLinkStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_email' });
    return;
  }
  try {
    const db = await getMongoDb();
    await startMagicLink(db, { email: parsed.data.email, ip: req.ip ?? '', lang: parsed.data.lang });
    res.json({ ok: true }); // Never echo __testToken to a real client.
  } catch (e) {
    const { status, code } = clientError(e);
    res.status(status).json({ error: code });
  }
});

/** POST /api/v1/auth/magic-link/consume */
router.post('/consume', async (req: Request, res: Response) => {
  const parsed = magicLinkConsumeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'link_invalid' });
    return;
  }
  try {
    const db = await getMongoDb();
    const { email } = await consumeMagicLink(db, { token: parsed.data.token });
    const resolved = await resolveWalletIdentity({ email, verifiedPhone: null });
    const { accessToken } = await issueWalletSession(res, {
      userId: resolved.prismaUserId,
      email: resolved.email,
      role: resolved.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // Best-effort: auto-accept pending invitations for this email (never fatal).
    let acceptedTenantIds: string[] = [];
    try {
      const { reconcilePendingInvitations } = await import(
        '../services/auth/wallet-invitation-reconcile.service'
      );
      const { getIdentityDomainCollections } = await import('../models/domain');
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
      console.error('[wallet-auth] magic-link reconcile failed (non-fatal):', reconcileErr);
    }
    res.json({ accessToken, identityCreated: resolved.identityCreated, acceptedTenantIds });
  } catch (e) {
    const { status, code } = clientError(e);
    res.status(status).json({ error: code });
  }
});

export default router;
