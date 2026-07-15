/**
 * Wallet email+password auth routes at /api/v1/auth/password/*. Pre-session
 * (no authenticate); abuse bounded by apiLimiter + authLimiter/resetLimiter +
 * the per-account lockout and per-email send limits in the service. Machine
 * error codes; the wallet localizes them. 2FA fires on EVERY password login -
 * no trusted-device cookie is issued or read here, by design.
 * Spec: docs/superpowers/specs/2026-07-14-wallet-email-password-auth-design.md
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getMongoDb } from '../config/mongo';
import { apiLimiter, authLimiter, resetLimiter } from '../middleware/rateLimiter';
import { issueWalletSession } from '../services/auth/session-issuer.service';
import { resendLoginOtpCode } from '../services/auth/login-otp.service';
import {
  startPasswordLogin,
  completePasswordChallenge,
  startPasswordForgot,
  verifyPasswordForgot,
  completePasswordForgot,
} from '../services/auth/wallet-password.service';

const router = Router();

// Coarse IP rate-limit layered on top of the per-account/per-email limits
// enforced inside the service (mirrors the other wallet auth routers).
router.use(apiLimiter);

const langSchema = z.enum(['he', 'en']).optional();
const loginSchema = z.object({
  email: z.string().email().max(320),
  // min 1, NOT the policy: existing legacy weak passwords must still LOG IN.
  // The policy gates only NEW passwords (signup path, reset completion).
  password: z.string().min(1).max(128),
  lang: langSchema,
  // Explicit action: 'login' (default) never creates an account; 'signup'
  // refuses an existing email. Splits the two so a login typo cannot register.
  intent: z.enum(['login', 'signup']).optional(),
});
const verifySchema = z.object({
  challengeToken: z.string().min(32).max(256),
  code: z.string().regex(/^\d{6}$/),
});
const resendSchema = z.object({ challengeToken: z.string().min(32).max(256) });
const forgotStartSchema = z.object({ email: z.string().email().max(320), lang: langSchema });
const forgotCompleteSchema = z.object({
  challengeToken: z.string().min(32).max(256),
  newPassword: z.string().min(1).max(128),
});

/** Map service error codes to HTTP responses (mirrors email-otp.routes). */
function clientError(e: unknown): { status: number; code: string } {
  const msg = e instanceof Error ? e.message : 'unknown';
  if (msg === 'invalid_credentials') return { status: 401, code: 'invalid_credentials' };
  if (msg === 'account_exists') return { status: 409, code: 'account_exists' };
  if (msg === 'account_locked') return { status: 429, code: 'account_locked' };
  if (msg === 'weak_password') return { status: 400, code: 'weak_password' };
  if (msg === 'password_unchanged') return { status: 400, code: 'password_unchanged' };
  if (msg === 'otp_invalid') return { status: 400, code: 'otp_invalid' };
  if (msg === 'otp_locked') return { status: 429, code: 'otp_locked' };
  if (msg.startsWith('rate_limited')) return { status: 429, code: 'rate_limited' };
  return { status: 500, code: 'internal_error' };
}

/** Uniform error responder for this router. */
function respondError(res: Response, e: unknown): void {
  const { status, code } = clientError(e);
  res.status(status).json({ error: code });
}

/** POST /api/v1/auth/password/login - password check, then a 2FA challenge. */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const db = await getMongoDb();
    const out = await startPasswordLogin(db, {
      email: parsed.data.email,
      password: parsed.data.password,
      ip: req.ip ?? null,
      lang: parsed.data.lang ?? 'he',
      intent: parsed.data.intent ?? 'login',
    });
    // Never echo the test-only __testCode field back to a client.
    res.json({ mode: '2fa_required', challengeToken: out.challengeToken });
  } catch (e) {
    respondError(res, e);
  }
});

/**
 * POST /api/v1/auth/password/verify - completes the 2FA challenge and ALWAYS
 * mints a session on success (signup path creates the account first).
 */
router.post('/verify', authLimiter, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'otp_invalid' });
    return;
  }
  try {
    const db = await getMongoDb();
    const resolved = await completePasswordChallenge(db, parsed.data);
    const { accessToken } = await issueWalletSession(res, {
      userId: resolved.prismaUserId,
      email: resolved.email,
      role: resolved.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // Auto-accept pending tenant invitations for this email (same non-fatal
    // reconcile the other wallet auth verifies run).
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
    respondError(res, e);
  }
});

/** POST /api/v1/auth/password/resend - rotate the code on the same challenge. */
router.post('/resend', authLimiter, async (req: Request, res: Response) => {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'otp_invalid' });
    return;
  }
  try {
    const db = await getMongoDb();
    await resendLoginOtpCode(db, { challengeToken: parsed.data.challengeToken });
    res.json({ sent: true });
  } catch (e) {
    respondError(res, e);
  }
});

/**
 * POST /api/v1/auth/password/forgot/start - ALWAYS returns a challenge token
 * (decoy for unknown emails); never reveals whether the account exists.
 */
router.post('/forgot/start', resetLimiter, async (req: Request, res: Response) => {
  const parsed = forgotStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const db = await getMongoDb();
    const out = await startPasswordForgot(db, {
      email: parsed.data.email,
      ip: req.ip ?? null,
      lang: parsed.data.lang ?? 'he',
    });
    res.json({ challengeToken: out.challengeToken });
  } catch (e) {
    respondError(res, e);
  }
});

/** POST /api/v1/auth/password/forgot/verify - checks the reset code. */
router.post('/forgot/verify', authLimiter, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'otp_invalid' });
    return;
  }
  try {
    const db = await getMongoDb();
    await verifyPasswordForgot(db, parsed.data);
    res.json({ verified: true });
  } catch (e) {
    respondError(res, e);
  }
});

/** POST /api/v1/auth/password/forgot/complete - sets the new password. */
router.post('/forgot/complete', authLimiter, async (req: Request, res: Response) => {
  const parsed = forgotCompleteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const db = await getMongoDb();
    await completePasswordForgot(db, parsed.data);
    res.json({ reset: true });
  } catch (e) {
    respondError(res, e);
  }
});

export default router;
