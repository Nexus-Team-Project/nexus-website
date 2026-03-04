import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { authLimiter, resetLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import { env } from '../config/env';
import * as AuthService from '../services/auth.service';
import * as EmailService from '../services/email.service';

const router = Router();

const REFRESH_COOKIE = 'nexus_refresh';
const COOKIE_OPTS = (maxAge: number) => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge,
  path: '/',
});

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    fullName: z.string().min(2).max(100),
    password: z.string().min(8).max(128),
    country: z.string().length(2).optional(),
    emailUpdates: z.boolean().optional(),
  }),
});

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.register(req.body, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      EmailService.sendWelcomeEmail(result.email, result.fullName).catch(console.error);
      const maxAge = result.ttlDays * 24 * 60 * 60 * 1000;
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, COOKIE_OPTS(maxAge));
      res.status(201).json({ accessToken: result.accessToken });
    } catch (err) {
      next(err);
    }
  },
);

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
    rememberMe: z.boolean().optional(),
  }),
});

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, rememberMe } = req.body;
      const result = await AuthService.login(email, password, rememberMe, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      const maxAge = result.ttlDays * 24 * 60 * 60 * 1000;
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, COOKIE_OPTS(maxAge));
      res.json({ accessToken: result.accessToken });
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
    })
    .refine((d) => d.idToken || d.code || d.accessToken, {
      message: 'idToken, code, or accessToken is required',
    }),
});

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
        result = await AuthService.googleAuth(req.body.idToken, meta);
      }
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, COOKIE_OPTS(7 * 24 * 60 * 60 * 1000));
      res.json({ accessToken: result.accessToken });
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
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { id: true, email: true, fullName: true, role: true, avatarUrl: true },
    });
    const maxAge = result.ttlDays * 24 * 60 * 60 * 1000;
    res.cookie(REFRESH_COOKIE, result.rawRefreshToken, COOKIE_OPTS(maxAge));
    res.json({ accessToken: result.accessToken, user });
  } catch (err) {
    next(err);
  }
});

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
  body: z.object({ email: z.string().email() }),
});

router.post(
  '/forgot-password',
  resetLimiter,
  validate(forgotSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = await AuthService.forgotPassword(req.body.email);
      if (rawToken) {
        const user = await prisma.user.findUnique({ where: { email: req.body.email } });
        if (user) {
          EmailService.sendPasswordResetEmail(user.email, user.fullName, rawToken).catch(console.error);
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
    newPassword: z.string().min(8).max(128),
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

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        country: true,
        avatarUrl: true,
        emailVerified: true,
        emailUpdates: true,
        provider: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
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