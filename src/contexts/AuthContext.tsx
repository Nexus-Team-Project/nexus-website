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

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN' | 'AGENT';
  avatarUrl?: string;
  emailVerified: boolean;
  onboardingDone: boolean;
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
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const googleLogin = useCallback(async (accessToken: string): Promise<AuthUser> => {
    const data = await api.post<{ accessToken: string; isNew?: boolean }>('/api/auth/google', { accessToken });
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
      api.post<{ accessToken: string }>('/api/auth/google', {
        code,
        redirectUri: window.location.origin,
      })
        .then(async (data) => {
          setAccessToken(data.accessToken);
          const profile = await api.get<AuthUser>('/api/auth/me');
          setUser(profile);
          // Persist first name so the welcome screen can show it after the full-page redirect
          // (access token is in memory and won't survive the navigation).
          if (profile.fullName) {
            sessionStorage.setItem('auth_first_name', profile.fullName.split(' ')[0]);
          }
          // Navigate to the destination that was saved before the Google redirect.
          // window.location.replace is used because useNavigate isn't available here
          // (AuthContext lives outside the Router boundary).
          sessionStorage.removeItem('google_oauth_redirect');
          const lang = window.location.pathname.startsWith('/he') ? '/he' : '';
          let dest: string;
          if (profile.role === 'ADMIN') {
            dest = '/admin';
          } else if (profile.onboardingDone) {
            dest = '/dashboard';
          } else {
            dest = `${lang}/workspace`;
          }
          window.location.replace(dest);
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

  const refreshUser = useCallback(async () => {
    const profile = await api.get<AuthUser>('/api/auth/me');
    setUser(profile);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, googleLogin, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}