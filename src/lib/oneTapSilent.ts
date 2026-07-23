/**
 * Silent-session flag for Google One Tap logins (2026-07-23 spec).
 * When set, the browser holds a REAL session (refresh cookie + token) but
 * the website keeps its logged-out presentation: home gates skip the
 * dashboard redirect and the Navbar keeps the guest layout (Login label
 * becomes Continue). Cleared the moment the user enters any explicit auth
 * flow (login/signup pages, dashboard handoff) or logs out.
 */
const KEY = 'nexus_one_tap_silent';

// In-tab change notification so UI (Navbar, Hero) reacts to the flag
// INSTANTLY - localStorage reads alone are not reactive in React.
type SilentFlagListener = () => void;
const listeners = new Set<SilentFlagListener>();

function emitSilentFlagChange(): void {
  listeners.forEach((listener) => listener());
}

/** Subscribe to flag changes (for useSyncExternalStore). Returns unsubscribe. */
export function subscribeOneTapSilent(listener: SilentFlagListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** True when the current session was created silently via One Tap. */
export function isOneTapSilentSession(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Marks the session silent. Call BEFORE the user lands in auth state. */
export function setOneTapSilentSession(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch { /* storage unavailable - session just behaves normally */ }
  emitSilentFlagChange();
}

/** Ends silence - normal session behavior (redirects, navbar) resumes. */
export function clearOneTapSilentSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
  emitSilentFlagChange();
}
