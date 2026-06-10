/**
 * Wallet phone routes — add / verify / change the phone on the authenticated
 * caller's NexusIdentity. The verified number is attached to the identity and
 * mirrored onto the caller's tenant contact + member rows.
 *
 *   POST /api/v1/wallet/phone/start        - send an InforU OTP (503 if no env)
 *   POST /api/v1/wallet/phone/verify       - verify the code + attach
 *
 * Plan: docs/superpowers/plans/2026-06-04-wallet-google-phone-collection.md
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { getCallingNexusIdentity } from '../services/wallet/wallet-identity.helper';
import {
  startWalletPhoneOtp,
  verifyWalletPhoneOtp,
} from '../services/wallet/wallet-phone-otp.service';
import { PhoneAttachError } from '../services/wallet/phone-attach.service';

const router = Router();

// Coarse IP rate-limit (100 req/min/IP) layered on top of the per-phone Mongo
// OTP limiter inside the service, to blunt SMS-cost abuse from a single source.
router.use(apiLimiter);

const phoneSchema = z.object({ phone: z.string().min(3).max(20) });
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
 * Map known errors to status codes; everything else is a 500. Logs every failure
 * with the route + mapped result so the cause is visible (rate limits, invalid
 * phone, collisions, SMS-unavailable, wrong code). 5xx also logs the raw error.
 */
function mapError(route: string, e: unknown, res: Response): void {
  let status = 500;
  let code = 'internal_error';
  if (e instanceof PhoneAttachError) {
    status = e.code === 'phone_in_use' ? 409 : 400;
    code = e.code;
  } else {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'sms_unavailable') { status = 503; code = 'sms_unavailable'; }
    else if (msg === 'otp_invalid' || msg === 'otp_locked') { status = 400; code = msg; }
    else if (msg.startsWith('rate_limited')) { status = 429; code = 'rate_limited'; }
    else if (msg === 'invalid_phone') { status = 400; code = 'phone_not_israeli'; }
    // Any InforU-side failure -> graceful SMS-unavailable (reason is logged in the
    // InforU client): inforu_not_configured / inforu_send_status_* / inforu_http_*.
    else if (msg.startsWith('inforu_')) { status = 503; code = 'sms_unavailable'; }
  }
  // Only a genuine, unexpected internal_error gets a stack trace; mapped/known
  // failures log one concise line (InforU reason is in the InforU client log).
  if (code === 'internal_error') console.error(`[wallet-phone] ${route} -> ${status} ${code}:`, e);
  else console.warn(`[wallet-phone] ${route} -> ${status} ${code}`);
  res.status(status).json({ error: code });
}

router.post('/phone/start', authenticate, async (req: Request, res: Response) => {
  const parsed = phoneSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn('[wallet-phone] POST /wallet/phone/start -> 400 invalid_request');
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) { res.status(404).json({ error: 'identity_not_found' }); return; }
    const db = await getMongoDb();
    const out = await startWalletPhoneOtp(db, {
      phone: parsed.data.phone,
      ip: clientIp(req),
      nexusIdentityId: me.nexusIdentityId,
    });
    console.info('[wallet-phone] POST /wallet/phone/start -> ok (OTP sent)');
    res.json(out);
  } catch (e) { mapError('POST /wallet/phone/start', e, res); }
});

router.post('/phone/verify', authenticate, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn('[wallet-phone] POST /wallet/phone/verify -> 400 invalid_request');
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) { res.status(404).json({ error: 'identity_not_found' }); return; }
    const db = await getMongoDb();
    const out = await verifyWalletPhoneOtp(db, {
      nexusIdentityId: me.nexusIdentityId,
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
    });
    console.info('[wallet-phone] POST /wallet/phone/verify -> ok (phone attached + propagated)');
    res.json({ ok: true, ...out });
  } catch (e) { mapError('POST /wallet/phone/verify', e, res); }
});

export default router;
