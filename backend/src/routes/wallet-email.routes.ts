/**
 * Wallet email routes - add / verify / change the email on the authenticated
 * caller's account. Mirrors the wallet phone attach routes.
 *
 *   POST /api/v1/wallet/email/start   {email, lang?} -> {challengeId}
 *   POST /api/v1/wallet/email/verify  {challengeId, code} -> {ok, email, accessToken}
 *
 * verify re-issues the session because wallet identity resolution keys off the
 * JWT email claim, which the attach just changed - the wallet client must
 * swap in the returned access token.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { prisma } from '../config/database';
import { getCallingNexusIdentity } from '../services/wallet/wallet-identity.helper';
import {
  startWalletEmailAttach,
  verifyWalletEmailAttach,
  EmailAttachError,
} from '../services/wallet/wallet-email-attach.service';
import { issueWalletSession } from '../services/auth/session-issuer.service';

const router = Router();

// Coarse IP rate limit layered over the per-email Mongo OTP limiter (1/30s + 5/h).
router.use(apiLimiter);

const startSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  lang: z.enum(['he', 'en']).optional(),
});
const verifySchema = z.object({
  challengeId: z.string().min(1).max(64),
  code: z.string().regex(/^\d{6}$/),
});

/** First client IP from x-forwarded-for, else the socket IP. */
function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]!.trim();
  return req.ip ?? '';
}

/** Map known errors to the stable vocabulary; everything else is 500. */
function mapError(route: string, e: unknown, res: Response): void {
  let status = 500;
  let code = 'internal_error';
  if (e instanceof EmailAttachError) {
    status = e.code === 'email_in_use' ? 409 : 400;
    code = e.code;
  } else {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'otp_invalid' || msg === 'otp_expired') { status = 400; code = msg; }
    else if (msg === 'otp_locked') { status = 429; code = 'otp_locked'; }
    else if (msg.startsWith('rate_limited')) { status = 429; code = 'rate_limited'; }
  }
  if (code === 'internal_error') console.error(`[wallet-email] ${route} -> ${status} ${code}:`, e);
  else console.warn(`[wallet-email] ${route} -> ${status} ${code}`);
  res.status(status).json({ error: code });
}

router.post('/email/start', authenticate, async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) { res.status(404).json({ error: 'identity_not_found' }); return; }
    const db = await getMongoDb();
    const out = await startWalletEmailAttach(db, {
      email: parsed.data.email,
      lang: parsed.data.lang,
      ip: clientIp(req),
      nexusIdentityId: me.nexusIdentityId,
      prismaUserId: req.user!.sub,
    });
    console.info('[wallet-email] POST /wallet/email/start -> ok (OTP sent)');
    // Never echo the test-only __testCode field back to a client.
    res.json({ challengeId: out.challengeId });
  } catch (e) { mapError('POST /wallet/email/start', e, res); }
});

router.post('/email/verify', authenticate, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) { res.status(404).json({ error: 'identity_not_found' }); return; }
    const db = await getMongoDb();
    const { email } = await verifyWalletEmailAttach(db, {
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
      nexusIdentityId: me.nexusIdentityId,
      prismaUserId: req.user!.sub,
    });
    // The old access token's email claim no longer resolves the identity -
    // re-issue the session on the NEW email so the caller keeps working.
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user) { res.status(500).json({ error: 'internal_error' }); return; }
    const { accessToken } = await issueWalletSession(res, {
      userId: user.id, email: user.email, role: user.role,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    console.info('[wallet-email] POST /wallet/email/verify -> ok (email attached)');
    res.json({ ok: true, email, accessToken });
  } catch (e) { mapError('POST /wallet/email/verify', e, res); }
});

export default router;
