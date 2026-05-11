/**
 * Defines the backend CORS policy for HTTP routes and Socket.io.
 * Only trusted website and dashboard origins can make browser calls
 * with credentials. Non-browser requests have no Origin header and are allowed.
 */
import type { CorsOptions } from 'cors';

const ALLOWED_BROWSER_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5174',
  'https://nexus-payment.com',
  'https://dashboard.nexus-payment.com',
] as const;

const allowedBrowserOrigins = new Set<string>(ALLOWED_BROWSER_ORIGINS);

/**
 * Checks whether a browser request origin is trusted.
 * Input: request Origin header, or undefined for non-browser requests.
 * Output: true when CORS should allow the request.
 */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return allowedBrowserOrigins.has(origin);
}

/**
 * Applies the shared CORS origin policy for Express.
 * Input: request Origin header and the cors package callback.
 * Output: callback approval or a clean CORS denial.
 */
function resolveHttpOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  callback(null, isAllowedOrigin(origin));
}

/** Allows trusted browser origins while supporting credentialed API requests. */
export const httpCorsOptions: CorsOptions = {
  origin: resolveHttpOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-anonymous-id', 'x-agent-key'],
};

/** Allows Socket.io clients from the same trusted browser origins as HTTP. */
export const socketCorsOptions = {
  origin: [...ALLOWED_BROWSER_ORIGINS],
  credentials: true,
};
