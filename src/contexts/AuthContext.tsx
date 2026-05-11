/* eslint-disable react-refresh/only-export-components */
/**
 * Owns the website authentication state and bridges successful user login
 * into the dashboard app with a short-lived backend-issued SSO code.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { api, setAccessToken, refreshAccessToken } from '../lib/api';
import { getVisitorId } from '../lib/visitorId';

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? '';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN' | 'AGENT';
  avatarUrl?: string;
  emailVerified: boolean;
  onboardingDone: boolean;
  orgMemberships?: { role: string; org: { id: string; slug: string; name: string; logoUrl?: string; primaryColor?: string } }[];
}

interface RegisterData {
  email: string;
  fullName: string;
  password: string;
  country?: string;
  emailUpdates?: boolean;
  dashboardRedirect?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AuthUser>;
  register: (data: RegisterData) => Promise<{ requiresVerification: true; email: string } | void>;
  googleLogin: (accessToken: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<AuthUser>) => void;
}

interface GoogleAuthResponse {
  accessToken: string;
  dashboardCode?: string;
  dashboardUrl?: string;
  isNew?: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const googleCodeRequests = new Map<string, Promise<GoogleAuthResponse>>();

/**
 * Infers the active website language without depending on React context.
 * Input: current route, saved preference, and document language.
 * Output: "he" for Hebrew context, otherwise "en".
 */
function getCurrentWebsiteLanguage(): 'he' | 'en' {
  if (window.location.pathname.startsWith('/he')) return 'he';
  const saved = localStorage.getItem('nexus-lang-preference');
  if (saved === 'he' || saved === 'en') return saved;
  return document.documentElement.lang === 'he' ? 'he' : 'en';
}

/**
 * Returns a safe dashboard path saved before a full-page Google redirect.
 * Input: value from sessionStorage.
 * Output: local dashboard path, or "/" when the saved value is unsafe.
 */
function getSavedGoogleDashboardRedirect(): string {
  const saved = sessionStorage.getItem('google_oauth_redirect');
  if (!saved || !saved.startsWith('/') || saved.startsWith('//')) return '/';
  return saved;
}

/**
 * Exchanges a Google OAuth code exactly once in dev StrictMode.
 * Input: Google code from the browser URL.
 * Output: backend auth response containing website tokens and dashboard handoff data.
 */
function exchangeGoogleCodeOnce(code: string): Promise<GoogleAuthResponse> {
  const existingRequest = googleCodeRequests.get(code);
  if (existingRequest) return existingRequest;

  const request = api.post<GoogleAuthResponse>('/api/auth/google', {
    code,
    redirectUri: window.location.origin,
    language: getCurrentWebsiteLanguage(),
    dashboardRedirect: getSavedGoogleDashboardRedirect(),
  });

  googleCodeRequests.set(code, request);
  return request;
}

/**
 * Logs auth handoff details only in local development.
 * Input: message and optional metadata safe for browser console.
 * Output: no value; writes to console only during Vite dev mode.
 */
function logAuthHandoff(message: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.info(`[Nexus auth] ${message}`, data ?? {});
}

/**
 * Builds a dashboard callback URL for a one-time SSO code.
 * Input: backend-issued code and dashboard path to open after exchange.
 * Output: absolute dashboard URL containing the code and redirect path.
 */
function buildDashboardCallbackUrl(code: string, redirectPath: string): string {
  const url = new URL('/auth/callback', DASHBOARD_URL);
  url.searchParams.set('code', code);
  url.searchParams.set('redirect', redirectPath);
  url.searchParams.set('lang', getCurrentWebsiteLanguage());
  return url.toString();
}

/**
 * Redirects normal users from the website app into the dashboard app.
 * Input: authenticated user profile from the website backend.
 * Output: true when a full-page dashboard redirect was started.
 */
async function redirectDashboardUser(profile: AuthUser, existingCode?: string): Promise<void> {
  const orgs = profile.orgMemberships ?? [];
  const savedRedirect = getSavedGoogleDashboardRedirect();
  const redirectPath = savedRedirect !== '/' ? savedRedirect : orgs.length === 1 ? `/organizations/${orgs[0].org.slug}` : '/';
  const code = existingCode ?? (await api.post<{ code: string }>('/api/auth/create-code')).code;
  window.location.replace(buildDashboardCallbackUrl(code, redirectPath));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const googleLogin = useCallback(async (accessToken: string): Promise<AuthUser> => {
    const data = await api.post<GoogleAuthResponse>('/api/auth/google', { accessToken });
    setAccessToken(data.accessToken);
    const profile = await api.get<AuthUser>('/api/auth/me');
    setUser(profile);
    // Identity resolution — cannot use useAnalytics hook here (circular dep), call api directly
    // Fire User_Signed_Up for new Google accounts, User_Logged_In for returning users
    void api.post('/api/analytics/track', {
      anonymousId: getVisitorId(),
      userId: profile.id,
      eventName: data.isNew ? 'User_Signed_Up' : 'User_Logged_In',
      channel: 'PRODUCT',
      properties: { method: 'google' },
      context: {},
      sentAt: new Date().toISOString(),
      mergeSource: data.isNew ? 'signup' : 'oauth',
    }).catch(() => {});
    return profile;
  }, []);

  useEffect(() => {
    // Check for Google OAuth redirect callback (Authorization Code Flow)
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    if (code) {
      // Clean the URL immediately so a refresh doesn't re-submit the code
      window.history.replaceState({}, document.title, window.location.pathname);
      logAuthHandoff('Google callback detected; exchanging code');
      exchangeGoogleCodeOnce(code)
        .then(async (data) => {
          const dashboardRedirect = getSavedGoogleDashboardRedirect();
          sessionStorage.removeItem('google_oauth_redirect');
          logAuthHandoff('Google exchange succeeded', {
            hasDashboardUrl: Boolean(data.dashboardUrl),
            hasDashboardCode: Boolean(data.dashboardCode),
          });

          if (data.dashboardUrl) {
            logAuthHandoff('Redirecting to dashboard callback', { dashboardUrl: data.dashboardUrl });
            window.location.replace(data.dashboardUrl);
            return;
          }

          if (data.dashboardCode) {
            const fallbackDashboardUrl = buildDashboardCallbackUrl(data.dashboardCode, dashboardRedirect);
            logAuthHandoff('Redirecting to dashboard callback from code fallback', {
              dashboardUrl: fallbackDashboardUrl,
            });
            window.location.replace(fallbackDashboardUrl);
            return;
          }

          logAuthHandoff('Dashboard URL missing; using profile fallback');
          setAccessToken(data.accessToken);
          const profile = await api.get<AuthUser>('/api/auth/me');
          setUser(profile);
          // Persist first name so the welcome screen can show it after the full-page redirect
          // (access token is in memory and won't survive the navigation).
          if (profile.fullName) {
            sessionStorage.setItem('auth_first_name', profile.fullName.split(' ')[0]);
          }
          await redirectDashboardUser(profile, data.dashboardCode);
        })
        .catch((error: unknown) => {
          console.error('[Nexus auth] Google dashboard handoff failed', error);
        })
        .finally(() => setIsLoading(false));
      return;
    }

    // Normal session restore
    refreshAccessToken()
      .then((result) => {
        if (result && result.user) setUser(result.user as AuthUser);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe = false): Promise<AuthUser> => {
    const data = await api.post<{ accessToken: string }>('/api/auth/login', { email, password, rememberMe });
    setAccessToken(data.accessToken);
    const profile = await api.get<AuthUser>('/api/auth/me');
    setUser(profile);
    return profile;
  }, []);

  const register = useCallback(async (registerData: RegisterData) => {
    const data = await api.post<{ requiresVerification?: boolean; email?: string; accessToken?: string }>('/api/auth/register', registerData);
    if (data.requiresVerification) {
      return { requiresVerification: true as const, email: data.email! };
    }
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => prev ? { ...prev, ...partial } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, googleLogin, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
