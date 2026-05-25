/**
 * Wallet phone-OTP HTTP routes mounted at /api/v1/auth/phone/*.
 * Each handler validates the body with Zod, delegates to the
 * phone-otp service, and maps service-layer errors to a stable
 * client-facing error vocabulary so the wallet UI can switch on it.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { Router, Request, Response } from 'express';
import { getMongoDb } from '../config/mongo';
import { prisma } from '../config/database';
import {
  phoneStartSchema,
  phoneVerifySchema,
  phoneResendSchema,
} from '../schemas/phone-otp.schemas';
import {
  startPhoneOtp,
  verifyPhoneOtp,
  resendPhoneOtp,
} from '../services/auth/phone-otp.service';
import { issueWalletSession } from '../services/auth/session-issuer.service';

const router = Router();

/**
 * Maps service errors to (status, code). Unknown errors collapse to
 * 500 + internal_error so we never leak provider text.
 */
function clientError(e: unknown): { status: number; code: string } {
  const msg = e instanceof Error ? e.message : 'unknown';
  if (msg === 'invalid_phone') return { status: 400, code: 'invalid_phone' };
  if (msg.startsWith('rate_limited')) return { status: 429, code: 'rate_limited' };
  if (msg === 'otp_invalid') return { status: 400, code: 'otp_invalid' };
  if (msg === 'otp_locked') return { status: 429, code: 'otp_locked' };
  if (msg === 'ticket_invalid') return { status: 400, code: 'ticket_invalid' };
  if (msg === 'inforu_not_configured') return { status: 503, code: 'sms_unavailable' };
  return { status: 500, code: 'internal_error' };
}

/** POST /api/v1/auth/phone/start - sends an OTP SMS. */
router.post('/start', async (req: Request, res: Response) => {
  const parsed = phoneStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  try {
    const db = await getMongoDb();
    const out = await startPhoneOtp(db, { phone: parsed.data.phone, ip: req.ip ?? '' });
    res.json(out);
  } catch (e) {
    const { status, code } = clientError(e);
    res.status(status).json({ error: code });
  }
});

/**
 * POST /api/v1/auth/phone/verify - checks the code. Two outcomes:
 * - known phone -> mints a session via issueWalletSession + returns
 *   { mode: 'logged_in', accessToken }
 * - unknown phone -> returns { mode: 'phone_verified', signupTicketId, phone }
 *   so the wallet can collect email or Google next
 */
router.post('/verify', async (req: Request, res: Response) => {
  const parsed = phoneVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'otp_invalid' });
    return;
  }
  try {
    const db = await getMongoDb();
    const r = await verifyPhoneOtp(db, parsed.data);
    if (r.mode === 'phone_verified') {
      res.json(r);
      return;
    }
    // mode === 'logged_in' - mint a session for the linked Prisma user.
    if (!r.prismaUserId) {
      res.status(500).json({ error: 'identity_corrupt' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: r.prismaUserId },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      res.status(500).json({ error: 'identity_corrupt' });
      return;
    }
    const { accessToken } = await issueWalletSession(res, {
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // Plan #1.5: best-effort auto-accept of pending invitations. A
    // reconcile hiccup must never break a working session; the next
    // login retries.
    let acceptedTenantIds: string[] = [];
    try {
      const { reconcilePendingInvitations } = await import(
        '../services/auth/wallet-invitation-reconcile.service'
      );
      const { getIdentityDomainCollections } = await import('../models/domain');
      const { nexusIdentities } = getIdentityDomainCollections(db);
      const identity = await nexusIdentities.findOne(
        { prismaUserId: user.id },
        { projection: { nexusIdentityId: 1, normalizedEmail: 1 } },
      );
      if (identity) {
        const reconciled = await reconcilePendingInvitations(db, {
          nexusIdentityId: identity.nexusIdentityId,
          email: identity.normalizedEmail,
        });
        acceptedTenantIds = reconciled.acceptedTenantIds;
      }
    } catch (reconcileErr) {
      console.error('[wallet-auth] reconcile failed (non-fatal):', reconcileErr);
    }
    res.json({ mode: 'logged_in', accessToken, acceptedTenantIds });
  } catch (e) {
    const { status, code } = clientError(e);
    res.status(status).json({ error: code });
  }
});

/** POST /api/v1/auth/phone/resend - issues a fresh OTP for the same phone. */
router.post('/resend', async (req: Request, res: Response) => {
  const parsed = phoneResendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'otp_invalid' });
    return;
  }
  try {
    const db = await getMongoDb();
    const out = await resendPhoneOtp(db, {
      challengeId: parsed.data.challengeId,
      ip: req.ip ?? '',
    });
    res.json(out);
  } catch (e) {
    const { status, code } = clientError(e);
    res.status(status).json({ error: code });
  }
});

export default router;
