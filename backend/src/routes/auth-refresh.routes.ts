/**
 * v1 session refresh: rotates the httpOnly refresh cookie and returns ONLY the
 * new access token.
 *
 * Registered ahead of the legacy auth router in v1.routes, so
 * POST /api/v1/auth/refresh serves this slim contract while the legacy
 * POST /api/auth/refresh (which also returns the full login user profile for
 * the website + dashboard) is untouched. The wallet uses this endpoint: it
 * never reads the user payload on refresh (GET /api/v1/wallet/me supplies the
 * user), so skipping the profile lookup removes a Postgres query per refresh
 * and keeps legacy login fields (provider, orgMemberships, ...) out of the
 * response.
 */
import { Router, Request, Response, NextFunction } from 'express';
import * as AuthService from '../services/auth.service';
import { REFRESH_COOKIE, refreshCookieOpts } from '../utils/auth-cookies';

const router = Router();

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
    res.cookie(REFRESH_COOKIE, result.rawRefreshToken, refreshCookieOpts());
    res.json({ accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

export default router;
