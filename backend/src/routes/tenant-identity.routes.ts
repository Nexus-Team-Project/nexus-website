/**
 * Tenant identity routes - edit name/description/website/phone after
 * onboarding (previously write-once at workspace creation, no edit path).
 *
 *   PATCH /api/v1/tenant/identity        - JSON, each field independently
 *     optional: `{ organizationName?, businessDescription?, website? }`.
 *   POST  /api/v1/tenant/phone/otp/start - `{ phone }`, Israeli mobiles only,
 *     sends an SMS OTP and returns `{ challengeId }`.
 *   PATCH /api/v1/tenant/phone           - `{ phone, challengeId?, otpCode? }`.
 *     Israeli mobiles require a matching challengeId + otpCode from the start
 *     call above; foreign numbers send just `{ phone }`.
 *
 * Gated by the same `workspace.update_settings` permission as the tenant
 * logo/cover/brand-color/social-links routes; the tenant id is derived from
 * the caller's membership, never trusted from the client. A thrown ZodError
 * -> 400 via the shared errorHandler - not hand-handled here.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { resolveTenantContextWithPermission } from '../utils/resolve-tenant-context';
import {
  tenantIdentityBodySchema,
  tenantPhoneOtpStartBodySchema,
  tenantPhoneBodySchema,
} from '../schemas/tenant-identity.schemas';
import { updateTenantIdentity } from '../services/tenant-identity.service';
import { startTenantPhoneChange, saveTenantPhone } from '../services/tenant-phone.service';

const router = Router();

router.use(apiLimiter);

/** First client IP from x-forwarded-for, else the socket IP. Matches the
 *  onboarding phone-OTP route's helper - same rate-limit key derivation. */
function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]!.trim();
  return req.ip ?? '';
}

/** Map a thrown permission/OTP/error to a status + code, mirroring the
 *  tenant-logo route's handleError plus the OTP-specific error codes. */
function handleError(e: unknown, res: Response, next: NextFunction): void {
  const status = (e as { status?: number }).status;
  const msg = e instanceof Error ? e.message : '';
  if (status === 403) { res.status(403).json({ error: 'forbidden' }); return; }
  if (status === 401) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (status === 404) { res.status(404).json({ error: msg || 'not_found' }); return; }
  if (status === 400) { res.status(400).json({ error: msg || 'bad_request' }); return; }
  if (msg === 'otp_invalid' || msg === 'otp_locked') { res.status(400).json({ error: msg }); return; }
  if (msg.startsWith('rate_limited')) { res.status(429).json({ error: 'rate_limited' }); return; }
  if (msg.startsWith('inforu_')) { res.status(503).json({ error: 'sms_unavailable' }); return; }
  next(e);
}

router.patch('/identity', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, identityId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const body = tenantIdentityBodySchema.parse(req.body);
    const db = await getMongoDb();
    const out = await updateTenantIdentity(db, { tenantId, callerIdentityId: identityId, ...body });
    res.json(out);
  } catch (e) {
    handleError(e, res, next);
  }
});

router.post('/phone/otp/start', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const { phone } = tenantPhoneOtpStartBodySchema.parse(req.body);
    const db = await getMongoDb();
    const out = await startTenantPhoneChange(db, { phone, ip: clientIp(req) });
    // Never echo __testCode - respond with the challenge id only.
    res.json({ challengeId: out.challengeId });
  } catch (e) {
    handleError(e, res, next);
  }
});

router.patch('/phone', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, identityId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const { phone, challengeId, otpCode } = tenantPhoneBodySchema.parse(req.body);
    const db = await getMongoDb();
    const out = await saveTenantPhone(db, {
      tenantId,
      callerIdentityId: identityId,
      phone,
      challengeId,
      otpCode,
    });
    res.json(out);
  } catch (e) {
    handleError(e, res, next);
  }
});

export default router;
