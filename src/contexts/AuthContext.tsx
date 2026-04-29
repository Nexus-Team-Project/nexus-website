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

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:5174';

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

/**
 * Builds a dashboard callback URL for a one-time SSO code.
 * Input: backend-issued code and dashboard path to open after exchange.
 * Output: absolute dashboard URL containing the code and redirect path.
 */
function buildDashboardCallbackUrl(code: string, redirectPath: string): string {
  const url = new URL('/auth/callback', DASHBOARD_URL);
  url.searchParams.set('code', code);
  url.searchParams.set('redirect', redirectPath);
  return url.toString();
}

/**
 * Redirects normal users from the website app into the dashboard app.
 * Input: authenticated user profile from the website backend.
 * Output: true when a full-page dashboard redirect was started.
 */
async function redirectDashboardUser(profile: AuthUser, existingCode?: string): Promise<void> {
  const orgs = profile.orgMemberships ?? [];
  const redirectPath = orgs.length === 1 ? `/organizations/${orgs[0].org.slug}` : '/';
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
      setIsLoading(true);
      api.post<GoogleAuthResponse>('/api/auth/google', {
        code,
        redirectUri: window.location.origin,
      })
        .then(async (data) => {
          sessionStorage.removeItem('google_oauth_redirect');
          if (data.dashboardUrl) {
            window.location.replace(data.dashboardUrl);
            return;
          }

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
        .catch(console.error)
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
