/**
 * Onboarding phone-OTP routes - verify the Israeli phone typed in the
 * dashboard onboarding wizard before workspace creation.
 *
 *   POST /api/v1/onboarding/phone-otp/start    - send an InforU OTP (Israeli mobiles only)
 *   POST /api/v1/onboarding/phone-otp/verify   - verify the code, record the verification
 *   POST /api/v1/onboarding/phone-otp/dev-skip - mark verified, no SMS. Allowed
 *       outside production for anyone; in production allowed ONLY for NEXUS
 *       platform admins (404 for everyone else).
 *
 * Both routes are caller-scoped (authenticate only - the user verifies their
 * OWN phone; no tenant exists yet at this point in onboarding).
 *
 * Spec: docs/superpowers/specs/2026-07-06-onboarding-phone-otp-monday-popup-design.md
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { env } from '../config/env';
import { isPlatformAdminEmail } from '../utils/platform-admin';
import {
  startOnboardingPhoneOtp,
  verifyOnboardingPhoneOtp,
  devSkipOnboardingPhoneVerification,
} from '../services/onboarding/onboarding-phone-otp.service';

const router = Router();

// Coarse IP rate-limit layered on top of the per-phone Mongo OTP limiter,
// to blunt SMS-cost abuse from a single source.
router.use(apiLimiter);

const startSchema = z.object({ phone: z.string().min(3).max(25) });
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

/**
 * Map known errors to status codes; everything else is a 500. Known failures
 * log one concise line without the phone or code (no PII).
 */
function mapError(route: string, e: unknown, res: Response): void {
  let status = 500;
  let code = 'internal_error';
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'invalid_israeli_phone') { status = 400; code = 'invalid_israeli_phone'; }
  else if (msg === 'otp_invalid' || msg === 'otp_locked') { status = 400; code = msg; }
  else if (msg.startsWith('rate_limited')) { status = 429; code = 'rate_limited'; }
  else if (msg.startsWith('inforu_')) { status = 503; code = 'sms_unavailable'; }
  if (code === 'internal_error') console.error(`[onboarding-phone-otp] ${route} -> ${status} ${code}:`, e);
  else console.warn(`[onboarding-phone-otp] ${route} -> ${status} ${code}`);
  res.status(status).json({ error: code });
}

router.post('/start', authenticate, async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const db = await getMongoDb();
    const out = await startOnboardingPhoneOtp(db, { phone: parsed.data.phone, ip: clientIp(req) });
    console.info('[onboarding-phone-otp] POST /start -> ok (OTP sent)');
    // Never echo __testCode - respond with the challenge id only.
    res.json({ challengeId: out.challengeId });
  } catch (e) { mapError('POST /start', e, res); }
});

router.post('/verify', authenticate, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const db = await getMongoDb();
    const out = await verifyOnboardingPhoneOtp(db, {
      userId: req.user!.sub,
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
    });
    console.info('[onboarding-phone-otp] POST /verify -> ok (phone verified)');
    res.json(out);
  } catch (e) { mapError('POST /verify', e, res); }
});

// Mark the phone verified without sending an InforU SMS, so onboarding runs
// don't burn SMS credits. Allowed for anyone outside production; in production
// restricted to NEXUS platform admins (who create tenants via onboarding and
// need to skip the SMS step). 404 for non-admins in production.
router.post('/dev-skip', authenticate, async (req: Request, res: Response) => {
  if (env.NODE_ENV === 'production' && !isPlatformAdminEmail(req.user!.email)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const db = await getMongoDb();
    const out = await devSkipOnboardingPhoneVerification(db, {
      userId: req.user!.sub,
      phone: parsed.data.phone,
    });
    console.info('[onboarding-phone-otp] POST /dev-skip -> ok (phone marked verified, no SMS)');
    res.json(out);
  } catch (e) { mapError('POST /dev-skip', e, res); }
});

export default router;
