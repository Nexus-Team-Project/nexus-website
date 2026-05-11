import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from 'react';
import { LanguageProvider } from './i18n/LanguageContext';
import { useAnalytics } from './hooks/useAnalytics';
import ProtectedRoute from './components/ProtectedRoute';
import AccessibilityWidget from './components/AccessibilityWidget';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './contexts/AuthContext';
import { api } from './lib/api';

const ContactSalesButton = lazy(() => import('./components/ContactSalesButton'));
const LiveChat            = lazy(() => import('./components/LiveChat'));

// ─── Lazy-load every route ────────────────────────────────
// Each page becomes a separate chunk loaded only when navigated to.
// Home/HomeHe are most critical — still lazy but browsers prefetch them.
const Home               = lazy(() => import('./pages/Home'));
const HomeHe             = lazy(() => import('./pages/HomeHe'));
const Signup             = lazy(() => import('./pages/Signup'));
const Login              = lazy(() => import('./pages/Login'));
const SignupHe           = lazy(() => import('./pages/SignupHe'));
const LoginHe            = lazy(() => import('./pages/LoginHe'));
const WorkspaceSetupPage = lazy(() => import('./pages/WorkspaceSetupPage'));
const VerifyEmailPage    = lazy(() => import('./pages/VerifyEmailPage'));
const ForgotPassword     = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword      = lazy(() => import('./pages/ResetPassword'));
const PartnersPage       = lazy(() => import('./pages/PartnersPage'));
const PaymentsPage       = lazy(() => import('./pages/PaymentsPage'));
const BenefitsPage       = lazy(() => import('./pages/BenefitsPage'));
const BenefitsPageV1     = lazy(() => import('./pages/BenefitsPageV1'));
const AdminDashboard     = lazy(() => import('./pages/AdminDashboard'));
const UserDashboard      = lazy(() => import('./pages/UserDashboard'));
const BlogList           = lazy(() => import('./pages/BlogList'));
const BlogListHe         = lazy(() => import('./pages/BlogListHe'));
const ArticlePage        = lazy(() => import('./pages/Article'));
const ArticlePageHe      = lazy(() => import('./pages/ArticleHe'));
const PrivacyPolicyPage  = lazy(() => import('./pages/PrivacyPolicyPage'));
const AccessibilityPage  = lazy(() => import('./pages/AccessibilityPage'));
const TermsOfUsePage     = lazy(() => import('./pages/TermsOfUsePage'));
const NexusLandingPage   = lazy(() => import('./pages/NexusLandingPage'));
const ApiDocsPage        = lazy(() => import('./pages/ApiDocsPage'));
const ChangelogPage      = lazy(() => import('./pages/Changelog'));
const ChangelogPageHe    = lazy(() => import('./pages/ChangelogHe'));
const LiveInbox          = lazy(() => import('./pages/LiveInbox'));
const JoinOrg            = lazy(() => import('./pages/JoinOrg'));
const Profile            = lazy(() => import('./pages/Profile'));
const OrgSelectPage      = lazy(() => import('./pages/OrgSelectPage'));
const AdminLayout        = lazy(() => import('./components/admin/AdminLayout'));
const AgentListPage      = lazy(() => import('./pages/admin/AgentListPage'));
const AgentDetailPage    = lazy(() => import('./pages/admin/AgentDetailPage'));
const SeoAnalyticsPage   = lazy(() => import('./pages/admin/SeoAnalyticsPage'));

const LANG_PREF_KEY = 'nexus-lang-preference';
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:5174';

interface DashboardRedirectProfile {
  orgMemberships?: { org: { slug: string } }[];
}

/**
 * Builds the dashboard callback URL that exchanges a one-time auth code.
 * Input: backend-issued SSO code and the dashboard path to open afterward.
 * Output: absolute dashboard callback URL.
 */
function buildDashboardCallbackUrl(code: string, redirectPath: string): string {
  const url = new URL('/auth/callback', DASHBOARD_URL);
  url.searchParams.set('code', code);
  url.searchParams.set('redirect', redirectPath);
  url.searchParams.set('lang', getCurrentWebsiteLanguage());
  return url.toString();
}

/**
 * Infers website language for auth handoffs created outside route pages.
 * Input: current route, saved language preference, and browser language.
 * Output: "he" when Hebrew is preferred, otherwise "en".
 */
function getCurrentWebsiteLanguage(): 'he' | 'en' {
  if (window.location.pathname.startsWith('/he')) return 'he';
  const saved = localStorage.getItem(LANG_PREF_KEY);
  if (saved === 'he' || saved === 'en') return saved;
  const browserLang = navigator.language ?? '';
  return browserLang.toLowerCase().startsWith('he') ? 'he' : 'en';
}

/**
 * Chooses the dashboard route for an authenticated website session.
 * Input: restored website user profile with organization memberships.
 * Output: organization dashboard route when there is one org, otherwise root.
 */
function getDashboardRedirectPath(user: DashboardRedirectProfile): string {
  const orgs = user.orgMemberships ?? [];
  return orgs.length === 1 ? `/organizations/${orgs[0].org.slug}` : '/';
}

/**
 * Redirects authenticated website visitors into the dashboard app.
 * Input: restored website user profile.
 * Output: browser leaves the website after receiving a one-time SSO code.
 */
async function redirectWebsiteSessionToDashboard(user: DashboardRedirectProfile): Promise<void> {
  const { code } = await api.post<{ code: string }>('/api/auth/create-code');
  window.location.replace(buildDashboardCallbackUrl(code, getDashboardRedirectPath(user)));
}

// ─── Subdomain-aware root route ───────────────────────────
// docs.nexus-payment.com → ApiDocsPage (EN), rendered directly — no redirect,
// so the URL stays at "/" and there is no "docs/docs" confusion.
function RootRoute() {
  if (window.location.hostname === 'docs.nexus-payment.com') {
    return (
      <LanguageProvider language="en">
        <ApiDocsPage />
      </LanguageProvider>
    );
  }
  return <GeoDetectHome />;
}

// ─── Geo-language detection for root route ────────────────
// Synchronous check determines if we KNOW the user wants Hebrew.
// If yes → show spinner + redirect immediately (fast, no flash).
// If unknown → render Home immediately, detect IP in background.
// This avoids a 1-3 second spinner (which killed mobile LCP).
function GeoDetectHome() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirectedDashboard = useRef(false);
  const [redirectFailed, setRedirectFailed] = useState(false);

  /**
   * Builds the Hebrew root redirect target without losing OAuth query data.
   * Input: current browser location from React Router.
   * Output: /he path with the original query string and hash preserved.
   */
  const hebrewRootPath = `/he${location.search}${location.hash}`;

  // Synchronous: do we already know the user wants Hebrew?
  const knownHe = (() => {
    const s = localStorage.getItem(LANG_PREF_KEY);
    if (s === 'he') return true;
    if (!s && (navigator.language ?? '').toLowerCase().startsWith('he')) return true;
    return false;
  })();

  useEffect(() => {
    /**
     * Sends restored website sessions to the dashboard from the main page.
     * Input: current auth context state.
     * Output: dashboard handoff starts once when a user session exists.
     */
    const redirectAuthenticatedRoot = async () => {
      if (isAuthLoading || !user || hasRedirectedDashboard.current) return;
      hasRedirectedDashboard.current = true;

      try {
        await redirectWebsiteSessionToDashboard(user);
      } catch (error) {
        console.error('[Nexus auth] Main-page dashboard redirect failed', error);
        setRedirectFailed(true);
      }
    };

    void redirectAuthenticatedRoot();
  }, [isAuthLoading, user]);

  useEffect(() => {
    const stored = localStorage.getItem(LANG_PREF_KEY);

    if (stored === 'he') {
      navigate(hebrewRootPath, { replace: true });
      return;
    }

    const browserLang = navigator.language ?? '';
    if (!stored && browserLang.toLowerCase().startsWith('he')) {
      localStorage.setItem(LANG_PREF_KEY, 'he');
      navigate(hebrewRootPath, { replace: true });
      return;
    }

    if (stored === 'en') return; // already know → stay on English Home

    // Unknown first-time visitor: Home is already rendered.
    // Detect country in background — redirect only if Israel.
    fetch('https://ipapi.co/country/')
      .then((r) => r.text())
      .then((country) => {
        const lang = country.trim() === 'IL' ? 'he' : 'en';
        localStorage.setItem(LANG_PREF_KEY, lang);
        if (lang === 'he') navigate(hebrewRootPath, { replace: true });
        // if 'en', stay (Home is already visible)
      })
      .catch(() => {
        localStorage.setItem(LANG_PREF_KEY, 'he');
        navigate(hebrewRootPath, { replace: true });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if ((isAuthLoading || (user && !redirectFailed)) || knownHe) return <PageLoader />;
  return <Home />;
}

/**
 * Keeps language-specific home routes session-aware.
 * Input: public home page content.
 * Output: loading state during auth restore, dashboard redirect for users, or content.
 */
function WebsiteHomeSessionGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const hasRedirectedDashboard = useRef(false);
  const [redirectFailed, setRedirectFailed] = useState(false);

  useEffect(() => {
    /**
     * Starts a dashboard handoff for already-authenticated home visitors.
     * Input: current auth context state.
     * Output: dashboard navigation starts once when possible.
     */
    const redirectAuthenticatedHome = async () => {
      if (isLoading || !user || hasRedirectedDashboard.current) return;
      hasRedirectedDashboard.current = true;

      try {
        await redirectWebsiteSessionToDashboard(user);
      } catch (error) {
        console.error('[Nexus auth] Home dashboard redirect failed', error);
        setRedirectFailed(true);
      }
    };

    void redirectAuthenticatedHome();
  }, [isLoading, user]);

  if (isLoading || (user && !redirectFailed)) return <PageLoader />;
  return <>{children}</>;
}

// ─── Language Gate ───────────────────────────────────────
// Wraps English-only public routes. If the user's preferred language is
// Hebrew, immediately redirects to the /he equivalent (prepends /he to
// the current pathname). Detection is fully synchronous — no spinner.
//
// Detection order:
//   1. localStorage 'nexus-lang-preference'   (set by GeoDetectHome or prev visit)
//   2. navigator.language starts with 'he'    (browser/OS language setting)
//   3. Neither → render English content as-is
function LanguageGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const stored = localStorage.getItem(LANG_PREF_KEY);

  if (stored === 'he') {
    return (
      <Navigate
        to={'/he' + location.pathname + location.search + location.hash}
        replace
      />
    );
  }

  if (!stored) {
    const browserLang = navigator.language ?? '';
    if (browserLang.toLowerCase().startsWith('he')) {
      localStorage.setItem(LANG_PREF_KEY, 'he');
      return (
        <Navigate
          to={'/he' + location.pathname + location.search + location.hash}
          replace
        />
      );
    }
  }

  return <>{children}</>;
}

// ─── Global analytics tracker ────────────────────────────
// Fires Page_Viewed on every route change.
// Lives inside BrowserRouter so it can access useLocation.
function RouteAnalytics() {
  const { pathname } = useLocation();
  const { page } = useAnalytics();

  useEffect(() => {
    // Determine channel from path
    const channel =
      pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
        ? 'PRODUCT'
        : 'MARKETING';
    page(channel, pathname);
    window.scrollTo(0, 0);

    // Keep <html lang/dir> in sync with the active route so the browser
    // renders the tab title with the correct language/direction hints.
    const isHe = pathname.startsWith('/he');
    document.documentElement.lang = isHe ? 'he' : 'en';
    document.documentElement.dir  = isHe ? 'rtl' : 'ltr';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

// Minimal full-screen spinner shown while a route chunk is loading
function PageLoader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        background: '#000',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid #222',
          borderTopColor: '#fff',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** Chat widget rendered outside Routes so it persists across navigation.
 *  Hidden on admin/inbox pages where it would overlap the dashboard UI. */
function ChatWidget() {
  const { pathname } = useLocation();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const language = pathname.startsWith('/he') ? 'he' : 'en';

  // Hide on admin pages
  const isAdmin = pathname.includes('/admin') || pathname.includes('/inbox');
  if (isAdmin) return null;

  return (
    <LanguageProvider language={language}>
      {!isChatOpen && (
        <Suspense fallback={null}>
          <ContactSalesButton onClick={() => setIsChatOpen(true)} />
        </Suspense>
      )}
      {isChatOpen && (
        <Suspense fallback={null}>
          <LiveChat
            onClose={() => setIsChatOpen(false)}
            onMinimize={() => setIsChatOpen(false)}
          />
        </Suspense>
      )}
    </LanguageProvider>
  );
}

/** Hide accessibility widget on admin pages */
function ConditionalAccessibility() {
  const { pathname } = useLocation();
  const isAdmin = pathname.includes('/admin') || pathname.includes('/inbox');
  if (isAdmin) return null;
  return <AccessibilityWidget />;
}

function App() {
  return (
    <BrowserRouter>
      <RouteAnalytics />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"         element={<RootRoute />} />
          <Route path="/he"       element={<WebsiteHomeSessionGate><HomeHe /></WebsiteHomeSessionGate>} />
          {/* ── Auth ─────────────────────────────────────────── */}
          <Route path="/signup"   element={<LanguageGate><LanguageProvider language="en"><Signup /></LanguageProvider></LanguageGate>} />
          <Route path="/login"    element={<LanguageGate><LanguageProvider language="en"><Login /></LanguageProvider></LanguageGate>} />
          <Route path="/he/signup"   element={<SignupHe />} />
          <Route path="/he/login"    element={<LoginHe />} />
          <Route path="/workspace"    element={<LanguageGate><LanguageProvider language="en"><WorkspaceSetupPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/workspace" element={<LanguageProvider language="he"><WorkspaceSetupPage /></LanguageProvider>} />
          <Route path="/verify-email"      element={<LanguageGate><LanguageProvider language="en"><VerifyEmailPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/verify-email"   element={<LanguageProvider language="he"><VerifyEmailPage /></LanguageProvider>} />
          <Route path="/forgot-password"    element={<LanguageGate><LanguageProvider language="en"><ForgotPassword /></LanguageProvider></LanguageGate>} />
          <Route path="/he/forgot-password" element={<LanguageProvider language="he"><ForgotPassword /></LanguageProvider>} />
          <Route path="/reset-password"    element={<LanguageGate><LanguageProvider language="en"><ResetPassword /></LanguageProvider></LanguageGate>} />
          <Route path="/he/reset-password" element={<LanguageProvider language="he"><ResetPassword /></LanguageProvider>} />
          {/* ── Marketing pages ──────────────────────────────── */}
          <Route path="/partners"    element={<LanguageGate><LanguageProvider language="en"><PartnersPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/partners" element={<LanguageProvider language="he"><PartnersPage /></LanguageProvider>} />
          <Route path="/payments"    element={<LanguageGate><LanguageProvider language="en"><PaymentsPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/payments" element={<LanguageProvider language="he"><PaymentsPage /></LanguageProvider>} />
          <Route path="/benefits"    element={<LanguageGate><LanguageProvider language="en"><BenefitsPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/benefits" element={<LanguageProvider language="he"><BenefitsPage /></LanguageProvider>} />
          <Route path="/benefits-type-2"    element={<LanguageGate><LanguageProvider language="en"><BenefitsPageV1 /></LanguageProvider></LanguageGate>} />
          <Route path="/he/benefits-type-2" element={<LanguageProvider language="he"><BenefitsPageV1 /></LanguageProvider>} />
          {/* ── Blog ─────────────────────────────────────────── */}
          <Route path="/blog"          element={<LanguageGate><BlogList /></LanguageGate>} />
          <Route path="/he/blog"       element={<BlogListHe />} />
          <Route path="/blog/:slug"    element={<LanguageGate><ArticlePage /></LanguageGate>} />
          <Route path="/he/blog/:slug" element={<ArticlePageHe />} />
          {/* ── Legal / Misc ──────────────────────────────────── */}
          <Route path="/privacy"         element={<LanguageGate><LanguageProvider language="en"><PrivacyPolicyPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/privacy"      element={<LanguageProvider language="he"><PrivacyPolicyPage /></LanguageProvider>} />
          <Route path="/accessibility"    element={<LanguageGate><LanguageProvider language="en"><AccessibilityPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/accessibility" element={<LanguageProvider language="he"><AccessibilityPage /></LanguageProvider>} />
          <Route path="/terms"       element={<LanguageGate><LanguageProvider language="en"><TermsOfUsePage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/terms"    element={<LanguageProvider language="he"><TermsOfUsePage /></LanguageProvider>} />
          <Route path="/welfare"     element={<LanguageGate><LanguageProvider language="en"><NexusLandingPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/welfare"  element={<LanguageProvider language="he"><NexusLandingPage /></LanguageProvider>} />
          <Route path="/docs"        element={<LanguageGate><LanguageProvider language="en"><ApiDocsPage /></LanguageProvider></LanguageGate>} />
          <Route path="/he/docs"     element={<LanguageProvider language="he"><ApiDocsPage /></LanguageProvider>} />
          <Route path="/changelog"   element={<LanguageGate><ChangelogPage /></LanguageGate>} />
          <Route path="/he/changelog" element={<ChangelogPageHe />} />
          <Route path="/dashboard" element={
            <ProtectedRoute redirectTo="/login">
              <UserDashboard />
            </ProtectedRoute>
          } />
          <Route path="/he/dashboard" element={
            <ProtectedRoute redirectTo="/he/login">
              <UserDashboard />
            </ProtectedRoute>
          } />
          {/* Admin routes with sidebar layout */}
          <Route path="/admin" element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']} redirectTo="/login">
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="agents" element={<ErrorBoundary><AgentListPage /></ErrorBoundary>} />
            <Route path="agents/:slug" element={<ErrorBoundary><AgentDetailPage /></ErrorBoundary>} />
            <Route path="inbox" element={<ErrorBoundary><LiveInbox /></ErrorBoundary>} />
            <Route path="seo-analytics" element={<ErrorBoundary><SeoAnalyticsPage /></ErrorBoundary>} />
          </Route>
          <Route path="/he/admin" element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']} redirectTo="/he/login">
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="agents" element={<ErrorBoundary><AgentListPage /></ErrorBoundary>} />
            <Route path="agents/:slug" element={<ErrorBoundary><AgentDetailPage /></ErrorBoundary>} />
            <Route path="inbox" element={<ErrorBoundary><LiveInbox /></ErrorBoundary>} />
            <Route path="seo-analytics" element={<ErrorBoundary><SeoAnalyticsPage /></ErrorBoundary>} />
          </Route>
          <Route path="/org-select"    element={<LanguageProvider language="en"><OrgSelectPage /></LanguageProvider>} />
          <Route path="/he/org-select" element={<LanguageProvider language="he"><OrgSelectPage /></LanguageProvider>} />
          <Route path="/join/:token" element={<JoinOrg />} />
          <Route path="/profile" element={
            <ProtectedRoute redirectTo="/login">
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/he/profile" element={
            <ProtectedRoute redirectTo="/he/login">
              <Profile />
            </ProtectedRoute>
          } />
        </Routes>
      </Suspense>
      <ChatWidget />
      <ConditionalAccessibility />
    </BrowserRouter>
  );
}

export default App;
