/**
 * Login OTP (second factor) HTTP routes for privileged website logins on
 * unrecognized devices. Pre-session: no authenticate middleware; abuse is
 * bounded by authLimiter + per-challenge attempt caps + per-email send
 * rate limits. Error codes (otp_invalid / otp_locked / rate_limited) are
 * machine-readable; the frontend localizes them.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import * as LoginMfaService from '../services/auth/login-mfa.service';
import { resendLoginOtpCode } from '../services/auth/login-otp.service';
import {
  REFRESH_COOKIE,
  refreshCookieOpts,
  TRUSTED_DEVICE_COOKIE,
  trustedDeviceCookieOpts,
} from '../utils/auth-cookies';

const router = Router();

const verifySchema = z.object({
  body: z.object({
    challengeToken: z.string().min(32).max(256),
    code: z.string().regex(/^\d{6}$/),
  }),
});

const resendSchema = z.object({
  body: z.object({
    challengeToken: z.string().min(32).max(256),
  }),
});

/** Maps known OTP error codes to HTTP responses; forwards the rest. */
function handleOtpError(err: unknown, res: Response, next: NextFunction): void {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'otp_locked') {
    res.status(429).json({ error: 'otp_locked' });
    return;
  }
  if (msg === 'otp_invalid') {
    res.status(400).json({ error: 'otp_invalid' });
    return;
  }
  if (msg.startsWith('rate_limited')) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  next(err);
}

router.post(
  '/mfa/verify',
  authLimiter,
  validate(verifySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await LoginMfaService.completeLoginOtp({
        challengeToken: req.body.challengeToken,
        code: req.body.code,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, refreshCookieOpts());
      res.cookie(TRUSTED_DEVICE_COOKIE, result.trustedDeviceToken, trustedDeviceCookieOpts());
      res.json({ accessToken: result.accessToken });
    } catch (err) {
      handleOtpError(err, res, next);
    }
  },
);

router.post(
  '/mfa/resend',
  authLimiter,
  validate(resendSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = await getMongoDb();
      await resendLoginOtpCode(db, { challengeToken: req.body.challengeToken });
      res.json({ sent: true });
    } catch (err) {
      handleOtpError(err, res, next);
    }
  },
);

export default router;
