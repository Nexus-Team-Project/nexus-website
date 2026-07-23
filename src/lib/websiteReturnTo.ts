/**
 * "Return to the website after login" support (2026-07-23, One Tap follow-up).
 * When a flow sends a guest to /login with ?returnTo=<website path> (e.g. the
 * partners lock label while Google One Tap is in dismissal cooldown), a
 * successful login navigates BACK to that website page instead of the usual
 * dashboard handoff. The path survives the Google OAuth full-page round-trip
 * via sessionStorage.
 */
const KEY = 'nexus_website_return_to';

/** Validates a candidate: local website path only (no external/protocol-relative). */
export function sanitizeWebsiteReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/** Stores the path for flows that leave the page (Google OAuth redirect). */
export function saveWebsiteReturnTo(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch { /* storage unavailable - login just falls back to the dashboard */ }
}

/** Clears a stale path (login page opened WITHOUT a returnTo). */
export function clearWebsiteReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
}

/** Reads AND clears the stored path. Returns null when absent/invalid. */
export function consumeWebsiteReturnTo(): string | null {
  try {
    const value = sanitizeWebsiteReturnTo(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}
