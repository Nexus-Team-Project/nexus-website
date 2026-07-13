/**
 * Shared cookie names + options for the website auth flows. SameSite=Lax
 * is safe for same-registrable-domain cross-subdomain XHR; COOKIE_DOMAIN
 * (e.g. .nexus-payment.com) is set in production so cookies are shared
 * across subdomains. The trusted-device cookie is scoped to /api/auth so
 * it is only ever sent to auth endpoints.
 *
 * When CROSS_SITE_COOKIES is on (e.g. the Railway dev deploy where the
 * frontends and the API live on different *.up.railway.app sites), the cookie
 * switches to SameSite=None; Secure so the browser sends it on the cross-site
 * refresh call - without it, a page reload cannot restore the session and the
 * user is bounced to login. See env.ts CROSS_SITE_COOKIES.
 */
import { env } from '../config/env';

export const REFRESH_COOKIE = 'nexus_refresh';
export const TRUSTED_DEVICE_COOKIE = 'nexus_trusted_device';

const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const TRUSTED_DEVICE_MAX_AGE = 180 * 24 * 60 * 60 * 1000; // 180 days

/**
 * SameSite/Secure pair shared by every auth cookie. Cross-site requires
 * None + Secure (browsers reject SameSite=None without Secure); same-site keeps
 * Lax with Secure only in production (so http://localhost dev still sets it).
 */
const sameSiteSecure = () =>
  env.CROSS_SITE_COOKIES
    ? { sameSite: 'none' as const, secure: true }
    : { sameSite: 'lax' as const, secure: env.NODE_ENV === 'production' };

/** Options for the httpOnly refresh cookie (30 days, path /). */
export const refreshCookieOpts = () => ({
  httpOnly: true,
  ...sameSiteSecure(),
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
