/**
 * Wallet session-issuer. The single helper that phone-OTP, email-OTP,
 * and google/wallet endpoints call to mint a session: writes the
 * refresh-cookie + returns the access token. Delegates the actual
 * Prisma refresh-token row creation to auth.service.issueTokens so
 * wallet sessions live in the same pipeline as login/register/refresh.
 *
 * Cookie constants are duplicated from routes/auth.routes.ts on
 * purpose: changing the cookie name or options requires updating both
 * intentionally - centralizing this in a shared util is left for a
 * dedicated refactor.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import type { Response } from 'express';
import { env } from '../../config/env';
import { issueTokens } from '../auth.service';

const REFRESH_COOKIE = 'nexus_refresh';
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/**
 * Cookie options for the httpOnly refresh cookie shared across
 * .nexus-payment.com subdomains in production. When CROSS_SITE_COOKIES is on
 * (cross-registrable-domain HTTPS deploy, e.g. the wallet dev host calling the
 * dev API on a different *.up.railway.app site), it switches to
 * SameSite=None; Secure so the cookie survives the cross-site refresh call.
 * Mirrors refreshCookieOpts in utils/auth-cookies.ts (kept in sync by hand).
 */
function cookieOpts() {
  return {
    httpOnly: true,
    ...(env.CROSS_SITE_COOKIES
      ? { sameSite: 'none' as const, secure: true }
      : { sameSite: 'lax' as const, secure: env.NODE_ENV === 'production' }),
    maxAge: REFRESH_MAX_AGE,
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

/**
 * Issue a fresh wallet session for an existing Prisma user identity.
 * Writes the refresh cookie on the response and returns the access
 * token. Callers (phone-OTP verify, email-OTP verify, google/wallet
 * verify) are responsible for ensuring the Prisma user exists before
 * calling.
 *
 * @param res Express response (refresh cookie is set here)
 * @param args.userId Prisma User.id
 * @param args.email Prisma User.email
 * @param args.role Prisma User.role (USER / ADMIN / AGENT)
 * @param args.ip request IP for audit logging
 * @param args.userAgent request User-Agent for audit logging
 * @returns the signed access token (JWT)
 */
export async function issueWalletSession(
  res: Response,
  args: { userId: string; email: string; role: string; ip?: string; userAgent?: string },
): Promise<{ accessToken: string }> {
  const tokens = await issueTokens(args.userId, args.email, args.role, {
    userAgent: args.userAgent,
    ipAddress: args.ip,
  });
  res.cookie(REFRESH_COOKIE, tokens.rawRefreshToken, cookieOpts());
  return { accessToken: tokens.accessToken };
}
