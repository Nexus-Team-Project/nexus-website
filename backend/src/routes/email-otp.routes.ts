/**
 * Wallet email-OTP HTTP routes mounted at /api/v1/auth/email-otp/*.
 *
 * /verify is where wallet identities get created or linked: it consumes
 * an optional phone-signup ticket, resolves (or creates) the paired
 * (Prisma User, NexusIdentity) pair via resolveWalletIdentity, attaches
 * the verified phone with collision cleanup, and mints a session.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { Router, Request, Response } from 'express';
import { getMongoDb } from '../config/mongo';
import { emailStartSchema, emailVerifySchema } from '../schemas/email-otp.schemas';
import { startEmailOtp, verifyEmailOtp } from '../services/auth/email-otp.service';
import { consumePhoneSignupTicket } from '../services/auth/phone-signup-ticket.service';
import { resolveWalletIdentity } from '../services/auth/wallet-identity.service';
import { issueWalletSession } from '../services/auth/session-issuer.service';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Coarse IP rate-limit (100 req/min/IP) layered on top of the per-email Mongo
// OTP limiter in the service (1/30s + 5/h per email) to blunt a request flood.
router.use(apiLimiter);

function clientError(e: unknown): { status: number; code: string } {
  const msg = e instanceof Error ? e.message : 'unknown';
  if (msg.startsWith('rate_limited')) return { status: 429, code: 'rate_limited' };
  if (msg === 'otp_invalid') return { status: 400, code: 'otp_invalid' };
  if (msg === 'otp_locked') return { status: 429, code: 'otp_locked' };
  if (msg === 'ticket_invalid') return { status: 400, code: 'ticket_invalid' };
  return { status: 500, code: 'internal_error' };
}

/** POST /api/v1/auth/email-otp/start */
router.post('/start', async (req: Request, res: Response) => {
  const parsed = emailStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_email' });
    return;
  }
  try {
    const db = await getMongoDb();
    const out = await startEmailOtp(db, {
      email: parsed.data.email,
      ip: req.ip ?? '',
      signupTicketId: parsed.data.signupTicketId ?? null,
      lang: parsed.data.lang,
    });
    // Never echo the test-only __testCode field back to a client.
    res.json({ challengeId: out.challengeId });
  } catch (e) {
    const { status, code } = clientError(e);
    res.status(status).json({ error: code });
  }
});

/**
 * POST /api/v1/auth/email-otp/verify
 *
 * Always mints a session on success. The wallet client uses the
 * identityCreated + phoneLinked flags to decide which onboarding
 * screens to show next.
 */
router.post('/verify', async (req: Request, res: Response) => {
  const parsed = emailVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'otp_invalid' });
    return;
  }
  try {
    const db = await getMongoDb();
    const verified = await verifyEmailOtp(db, parsed.data);
    let verifiedPhone: string | null = null;
    if (verified.linkedPhoneSignupTicketId) {
      const ticket = await consumePhoneSignupTicket(db, verified.linkedPhoneSignupTicketId);
      verifiedPhone = ticket.phone;
    }
    const resolved = await resolveWalletIdentity({
      email: verified.email,
      verifiedPhone,
    });
    const { accessToken } = await issueWalletSession(res, {
      userId: resolved.prismaUserId,
      email: resolved.email,
      role: resolved.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // Plan #1.5: auto-accept pending invitations for this email.
    // This is the most common reconcile path - phone -> email-OTP is
    // where new wallet identities are born when the user was invited
    // but never opened the email.
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
      console.error('[wallet-auth] reconcile failed (non-fatal):', reconcileErr);
    }
    res.json({
      accessToken,
      identityCreated: resolved.identityCreated,
      phoneLinked: resolved.phoneLinked,
      acceptedTenantIds,
    });
  } catch (e) {
    const { status, code } = clientError(e);
    res.status(status).json({ error: code });
  }
});

export default router;
