/**
 * Defines public and authenticated auth HTTP routes for the website backend.
 * These routes also act as the identity provider for the dashboard app.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { authLimiter, resetLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import { env } from '../config/env';
import * as AuthService from '../services/auth.service';
import * as EmailService from '../services/email.service';
import { signEmailVerificationToken, verifyEmailVerificationToken } from '../utils/jwt';
import * as LoginMfaService from '../services/auth/login-mfa.service';
import { createOneTapLead } from '../services/monday-lead.service';
import { REFRESH_COOKIE, refreshCookieOpts, TRUSTED_DEVICE_COOKIE } from '../utils/auth-cookies';
import { passwordSchema } from '../utils/password-policy';

const router = Router();

const authCodeSchema = z.object({
  body: z.object({
    code: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
  }),
});

/**
 * Builds the dashboard callback URL that exchanges a one-time auth code.
 * Input: backend-issued dashboard code and requested dashboard path.
 * Output: absolute dashboard callback URL, or undefined when no dashboard URL is configured.
 */
function buildDashboardCallbackUrl(code: string, language: 'he' | 'en' = 'en', redirectPath = '/'): string | undefined {
  if (!env.DASHBOARD_URL) return undefined;

  const url = new URL('/auth/callback', env.DASHBOARD_URL);
  url.searchParams.set('code', code);
  url.searchParams.set('redirect', getSafeDashboardRedirect(redirectPath));
  url.searchParams.set('lang', language);
  return url.toString();
}

/**
 * Accepts only local dashboard paths for auth redirects.
 * Input: raw redirect value from the browser.
 * Output: safe local dashboard path.
 */
function getSafeDashboardRedirect(redirectPath: string | undefined): string {
  if (!redirectPath || !redirectPath.startsWith('/') || redirectPath.startsWith('//')) return '/';
  return redirectPath;
}

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    fullName: z.string().min(2).max(100),
    password: passwordSchema,
    country: z.string().length(2).optional(),
    emailUpdates: z.boolean().optional(),
    dashboardRedirect: z.string().min(1).max(500).optional(),
    language: z.enum(['he', 'en']).optional(),
  }),
});

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.register(req.body);
      // Send verification email instead of welcome email — account is not active until verified
      EmailService.sendVerificationEmail(
        result.email,
        result.fullName,
        result.rawVerificationToken,
        req.body.language ?? 'en',
      ).catch(console.error);
      res.status(201).json({ requiresVerification: true, email: result.email });
    } catch (err) {
      next(err);
    }
  },
);

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
    language: z.enum(['he', 'en']).optional(),
  }),
});

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outcome = await LoginMfaService.performLogin({
        email: req.body.email,
        password: req.body.password,
        trustedDeviceToken: req.cookies?.[TRUSTED_DEVICE_COOKIE] ?? null,
        lang: req.body.language ?? 'en',
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      if (outcome.kind === 'mfa_required') {
        // Privileged user on an unknown device: no session cookie yet.
        res.json({ mfaRequired: true, challengeToken: outcome.challengeToken });
        return;
      }
      res.cookie(REFRESH_COOKIE, outcome.rawRefreshToken, refreshCookieOpts());
      res.json({ accessToken: outcome.accessToken });
    } catch (err) {
      next(err);
    }
  },
);

const googleSchema = z.object({
  body: z
    .object({
      idToken: z.string().min(1).optional(),
      code: z.string().min(1).optional(),
      accessToken: z.string().min(1).optional(),
      redirectUri: z.string().url().optional(),
      language: z.enum(['he', 'en']).optional(),
      dashboardRedirect: z.string().min(1).max(500).optional(),
      // Google One Tap silent-login metadata (2026-07-23 spec): 'one_tap'
      // marks the request so a NEW user produces a Monday lead; page is the
      // website path the prompt appeared on (context only, never trusted).
      source: z.enum(['one_tap']).optional(),
      page: z.string().max(200).optional(),
    })
    .refine((d) => d.idToken || d.code || d.accessToken, {
      message: 'idToken, code, or accessToken is required',
    }),
});

/**
 * Decides whether a /api/auth/google request should produce a One Tap
 * Monday lead: only explicit one_tap idToken logins that CREATED the user.
 * Pure - exported for unit testing.
 * Input: request body subset + isNew from googleAuth. Output: boolean.
 */
export function shouldFireOneTapLead(
  body: { source?: string; idToken?: string },
  isNew: boolean,
): boolean {
  return body.source === 'one_tap' && Boolean(body.idToken) && isNew;
}

router.post(
  '/google',
  authLimiter,
  validate(googleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meta = { userAgent: req.headers['user-agent'], ipAddress: req.ip };
      let result;
      if (req.body.code) {
        result = await AuthService.googleAuthFromCode(req.body.code, meta, req.body.redirectUri);
      } else if (req.body.accessToken) {
        result = await AuthService.googleAuthFromAccessToken(req.body.accessToken, meta);
      } else {
        const googleResult = await AuthService.googleAuth(req.body.idToken, meta);
        if (shouldFireOneTapLead(req.body, googleResult.isNew)) {
          // Fire-and-forget: a Monday outage must never affect the auth response.
          void createOneTapLead({
            email: googleResult.email,
            fullName: googleResult.fullName,
            page: req.body.page,
          });
        }
        result = googleResult;
      }
      const dashboardCode = AuthService.createDashboardAuthCode(result.userId);
      const dashboardUrl = buildDashboardCallbackUrl(
        dashboardCode,
        req.body.language ?? 'en',
        req.body.dashboardRedirect,
      );
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, refreshCookieOpts());
      res.json({ accessToken: result.accessToken, dashboardCode, dashboardUrl, isNew: result.isNew ?? false });
    } catch (err) {
      next(err);
    }
  },
);

const verifyEmailSchema = z.object({
  body: z.object({ token: z.string().min(1) }),
});

router.post(
  '/verify-email',
  authLimiter,
  validate(verifyEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.verifyEmail(req.body.token, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, refreshCookieOpts());
      res.json({ accessToken: result.accessToken, dashboardRedirect: result.dashboardRedirect });
    } catch (err) {
      next(err);
    }
  },
);

const resendVerificationSchema = z.object({
  body: z.object({
    email: z.string().email(),
    language: z.enum(['he', 'en']).optional(),
  }),
});

router.post(
  '/resend-verification',
  resetLimiter,
  validate(resendVerificationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.resendVerification(req.body.email);
      if (result) {
        EmailService.sendVerificationEmail(
          result.email,
          result.fullName,
          result.rawToken,
          req.body.language ?? 'en',
        ).catch(console.error);
      }
      // Always return 200 to avoid leaking which emails are registered
      res.json({ message: 'If your email is registered and unverified, a new link has been sent.' });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }
    const result = await AuthService.refreshTokens(rawToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    const user = await AuthService.getUserProfile(result.userId);
    res.cookie(REFRESH_COOKIE, result.rawRefreshToken, refreshCookieOpts());
    res.json({ accessToken: result.accessToken, user });
  } catch (err) {
    next(err);
  }
});

router.post('/create-code', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = AuthService.createDashboardAuthCode(req.user!.sub);
    res.json({ code });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/code-exchange',
  authLimiter,
  validate(authCodeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.exchangeDashboardAuthCode(req.body.code, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, refreshCookieOpts());
      res.json({ accessToken: result.accessToken, user: result.user });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) await AuthService.logout(rawToken);
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.NODE_ENV === 'production', path: '/' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

const forgotSchema = z.object({
  body: z.object({
    email: z.string().email(),
    language: z.enum(['en', 'he']).optional(),
  }),
});

router.post(
  '/forgot-password',
  resetLimiter,
  validate(forgotSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = req.body.email.toLowerCase().trim();
      const rawToken = await AuthService.forgotPassword(email);
      if (rawToken) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          EmailService.sendPasswordResetEmail(user.email, user.fullName, rawToken, req.body.language ?? 'en').catch(console.error);
        }
      }
      res.json({ message: 'If the email exists, a reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  },
);

const resetSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    newPassword: passwordSchema,
  }),
});

router.post(
  '/reset-password',
  resetLimiter,
  validate(resetSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.resetPassword(req.body.token, req.body.newPassword);
      res.json({ message: 'Password reset successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/auth/verify-email?token=... ─────────────────

router.get('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.query.token as string | undefined;
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    let payload;
    try {
      payload = verifyEmailVerificationToken(token);
    } catch {
      res.status(400).json({ error: 'Invalid or expired verification link' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.emailVerified) {
      res.json({ message: 'Email already verified' });
      return;
    }
    if (user.email !== payload.email) {
      res.status(400).json({ error: 'Verification link is no longer valid' });
      return;
    }

    await prisma.user.update({ where: { id: payload.sub }, data: { emailVerified: true } });
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/resend-verification ───────────────────

router.post(
  '/resend-verification',
  resetLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        select: { id: true, email: true, fullName: true, emailVerified: true },
      });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      if (user.emailVerified) {
        res.json({ message: 'Email already verified' });
        return;
      }
      const token = signEmailVerificationToken(user.id, user.email);
      await EmailService.sendVerificationEmail(user.email, user.fullName, token);
      res.json({ message: 'Verification email sent' });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await AuthService.getUserProfile(req.user!.sub);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
