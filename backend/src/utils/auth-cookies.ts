/**
 * Shared cookie names + options for the website auth flows. SameSite=Lax
 * is safe for same-registrable-domain cross-subdomain XHR; COOKIE_DOMAIN
 * (e.g. .nexus-payment.com) is set in production so cookies are shared
 * across subdomains. The trusted-device cookie is scoped to /api/auth so
 * it is only ever sent to auth endpoints.
 */
import { env } from '../config/env';

export const REFRESH_COOKIE = 'nexus_refresh';
export const TRUSTED_DEVICE_COOKIE = 'nexus_trusted_device';

const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const TRUSTED_DEVICE_MAX_AGE = 180 * 24 * 60 * 60 * 1000; // 180 days

/** Options for the httpOnly refresh cookie (30 days, path /). */
export const refreshCookieOpts = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: REFRESH_MAX_AGE,
  path: '/',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

/** Options for the httpOnly trusted-device cookie (180 days, path /api/auth). */
export const trustedDeviceCookieOpts = () => ({
  ...refreshCookieOpts(),
  maxAge: TRUSTED_DEVICE_MAX_AGE,
  path: '/api/auth',
});
