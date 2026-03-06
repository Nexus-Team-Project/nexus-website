// ─── Shared API client ────────────────────────────────────────────────────────
// Access token is stored in memory (never localStorage) for XSS protection.
// The httpOnly refresh token cookie is sent automatically via `credentials: 'include'`.
// x-anonymous-id is always forwarded so server-side events can resolve identity.

// Use the explicit VITE_API_URL when set (local dev: http://localhost:3001).
// In production the SPA is served by the same Express server, so relative paths work —
// .env.production sets VITE_API_URL='' which collapses to empty string via ??.
const API_URL = import.meta.env.VITE_API_URL ?? '';

// ─── Anonymous ID ─────────────────────────────────────────────────────────────
// Lazy-read from localStorage so we don't import visitorId.ts at module level.
function getAnonymousId(): string | null {
  try { return localStorage.getItem('nexus_vid'); } catch { return null; }
}

let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ─── Token refresh ───────────────────────────────────────────────────────────

interface RefreshResult { user?: unknown }
let _refreshPromise: Promise<RefreshResult | null> | null = null;

export async function refreshAccessToken(): Promise<RefreshResult | null> {
  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefresh();
  const result = await _refreshPromise;
  _refreshPromise = null;
  return result;
}

async function _doRefresh(): Promise<RefreshResult | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      _accessToken = data.accessToken;
      // Return user profile so AuthContext avoids a second /me round-trip
      return { user: data.user ?? null };
    }
    _accessToken = null;
    return null;
  } catch {
    _accessToken = null;
    return null;
  }
}

// ─── Core request helper ─────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;
  const anonId = getAnonymousId();
  if (anonId) headers['x-anonymous-id'] = anonId;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401 then retry once
  if (res.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(method, path, body, true);
    throw { error: 'Session expired', status: 401 };
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw { ...err, status: res.status };
  }

  // Handle empty responses (204 etc.)
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

// ─── Public API surface ──────────────────────────────────────────────────────

export const api = {
  get:    <T>(path: string)              => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body?: unknown) => request<T>('PUT',    path, body),
  patch:  <T>(path: string, body?: unknown) => request<T>('PATCH',  path, body),
  delete: <T>(path: string)              => request<T>('DELETE', path),
};

export { API_URL };
