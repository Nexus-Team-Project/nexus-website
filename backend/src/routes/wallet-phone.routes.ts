/**
 * Wallet phone routes — add / verify / change the phone on the authenticated
 * caller's NexusIdentity. The verified number is attached to the identity and
 * mirrored onto the caller's tenant contact + member rows.
 *
 *   POST /api/v1/wallet/phone/start        - send an InforU OTP (503 if no env)
 *   POST /api/v1/wallet/phone/verify       - verify the code + attach
 *   POST /api/v1/wallet/phone/attach-test  - DEV stopgap: attach without OTP
 *
 * Plan: docs/superpowers/plans/2026-06-04-wallet-google-phone-collection.md
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { getMongoDb } from '../config/mongo';
import { getCallingNexusIdentity } from '../services/wallet/wallet-identity.helper';
import {
  startWalletPhoneOtp,
  verifyWalletPhoneOtp,
  attachWalletPhoneTest,
  isWalletPhoneOtpEnabled,
} from '../services/wallet/wallet-phone-otp.service';
import { PhoneAttachError } from '../services/wallet/phone-attach.service';

const router = Router();

const phoneSchema = z.object({ phone: z.string().min(3).max(20) });
const verifySchema = z.object({
  challengeId: z.string().min(1).max(64),
  code: z.string().min(3).max(8),
});

/** First client IP from x-forwarded-for, else the socket IP. */
function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]!.trim();
  return req.ip ?? '';
}

/** Map known errors to status codes; everything else is a 500. */
function mapError(e: unknown, res: Response): void {
  if (e instanceof PhoneAttachError) {
    res.status(e.code === 'phone_in_use' ? 409 : 400).json({ error: e.code });
    return;
  }
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'sms_unavailable') { res.status(503).json({ error: 'sms_unavailable' }); return; }
  if (msg === 'otp_invalid' || msg === 'otp_locked') { res.status(400).json({ error: msg }); return; }
  if (msg.startsWith('rate_limited')) { res.status(429).json({ error: 'rate_limited' }); return; }
  if (msg === 'invalid_phone') { res.status(400).json({ error: 'phone_not_israeli' }); return; }
  console.error('[wallet-phone] error:', e);
  res.status(500).json({ error: 'internal_error' });
}

router.post('/phone/start', authenticate, async (req: Request, res: Response) => {
  const parsed = phoneSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) { res.status(404).json({ error: 'identity_not_found' }); return; }
    const db = await getMongoDb();
    const out = await startWalletPhoneOtp(db, { phone: parsed.data.phone, ip: clientIp(req) });
    res.json(out);
  } catch (e) { mapError(e, res); }
});

router.post('/phone/verify', authenticate, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) { res.status(404).json({ error: 'identity_not_found' }); return; }
    const db = await getMongoDb();
    const out = await verifyWalletPhoneOtp(db, {
      nexusIdentityId: me.nexusIdentityId,
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
    });
    res.json({ ok: true, ...out });
  } catch (e) { mapError(e, res); }
});

router.post('/phone/attach-test', authenticate, async (req: Request, res: Response) => {
  // Dev stopgap: only while the real OTP flow is off (WALLET_PHONE_OTP_ENABLED).
  if (isWalletPhoneOtpEnabled()) { res.status(403).json({ error: 'test_disabled' }); return; }
  const parsed = phoneSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
  try {
    const me = await getCallingNexusIdentity(req);
    if (!me) { res.status(404).json({ error: 'identity_not_found' }); return; }
    const db = await getMongoDb();
    const out = await attachWalletPhoneTest(db, {
      nexusIdentityId: me.nexusIdentityId,
      phone: parsed.data.phone,
    });
    res.json({ ok: true, test: true, ...out });
  } catch (e) { mapError(e, res); }
});

export default router;
