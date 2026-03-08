import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { LanguageProvider } from './i18n/LanguageContext';
import { useAnalytics } from './hooks/useAnalytics';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AccessibilityWidget from './components/AccessibilityWidget';

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

const LANG_PREF_KEY = 'nexus-lang-preference';

// ─── Geo-language detection for root route ────────────────
// Checks stored preference first; falls back to IP geolocation.
// Default (on failure) is Hebrew.
function GeoDetectHome() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LANG_PREF_KEY);
    if (stored) {
      if (stored === 'he') {
        navigate('/he', { replace: true });
      } else {
        setReady(true); // show English home
      }
      return;
    }

    // Detect country via free IP geolocation API
    fetch('https://ipapi.co/country/')
      .then((r) => r.text())
      .then((country) => {
        const lang = country.trim() === 'IL' ? 'he' : 'en';
        localStorage.setItem(LANG_PREF_KEY, lang);
        if (lang === 'he') {
          navigate('/he', { replace: true });
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        // Default: Hebrew
        localStorage.setItem(LANG_PREF_KEY, 'he');
        navigate('/he', { replace: true });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return <PageLoader />;
  return <Home />;
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

/** Chat widget rendered outside Routes so it persists across navigation. */
function ChatWidget() {
  const { pathname } = useLocation();
  const language = pathname.startsWith('/he') ? 'he' : 'en';
  const isHebrew = language === 'he';

  // Three states: closed (initial), open (chat visible), minimized (compact bar)
  type ChatState = 'closed' | 'open' | 'minimized';
  const [chatState, setChatState] = useState<ChatState>(() => {
    // If there's an active session in sessionStorage, start minimized
    return sessionStorage.getItem('nexus-chat-session') ? 'minimized' : 'closed';
  });
  const [chatSessionId, setChatSessionId] = useState<string | null>(
    () => sessionStorage.getItem('nexus-chat-session'),
  );

  const handleSessionCreated = (id: string) => {
    setChatSessionId(id);
    sessionStorage.setItem('nexus-chat-session', id);
  };

  const handleClose = () => {
    // Full close — clear session so next open starts fresh
    setChatState('closed');
    setChatSessionId(null);
    sessionStorage.removeItem('nexus-chat-session');
  };

  const handleMinimize = () => {
    // Minimize — keep session so it can be resumed
    setChatState('minimized');
  };

  return (
    <LanguageProvider language={language}>
      {chatState === 'closed' && (
        <Suspense fallback={null}>
          <ContactSalesButton onClick={() => setChatState('open')} />
        </Suspense>
      )}
      {chatState === 'minimized' && (
        <button
          onClick={() => setChatState('open')}
          className="fixed bottom-0 z-50 bg-white rounded-t-2xl px-5 py-3 flex items-center gap-3 border border-b-0 border-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
          style={{
            [isHebrew ? 'right' : 'left']: '1.5rem',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
          }}
        >
          <div className="relative">
            <img src="/nexus-favicon.png" alt="" className="w-8 h-8 rounded-full" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
          </div>
          <div className={isHebrew ? 'text-right' : 'text-left'}>
            <span className="text-sm font-semibold text-slate-800 block">Nexus AI</span>
            <span className="text-[11px] text-slate-500">
              {isHebrew ? 'לחץ להמשך שיחה' : 'Click to continue chat'}
            </span>
          </div>
        </button>
      )}
      {chatState === 'open' && (
        <Suspense fallback={null}>
          <LiveChat
            onClose={handleClose}
            onMinimize={handleMinimize}
            existingSessionId={chatSessionId}
            onSessionCreated={handleSessionCreated}
          />
        </Suspense>
      )}
    </LanguageProvider>
  );
}

function App() {
  const { isLoading } = useAuth();
  const { search } = useLocation();
  // Capture whether we started with a ?code= param (OAuth callback).
  // useState initializer runs once — persists even after navigate() clears the URL.
  const [hadOAuthCode] = useState(() => new URLSearchParams(search).has('code'));

  // While AuthContext is exchanging the OAuth code, show only the loader.
  // This prevents the Home route from briefly rendering before the SPA redirect.
  if (hadOAuthCode && isLoading) return <PageLoader />;

  return (
    <>
      <RouteAnalytics />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"         element={<GeoDetectHome />} />
          <Route path="/he"       element={<HomeHe />} />
          <Route path="/signup"   element={<LanguageProvider language="en"><Signup /></LanguageProvider>} />
          <Route path="/login"    element={<LanguageProvider language="en"><Login /></LanguageProvider>} />
          <Route path="/he/signup"   element={<SignupHe />} />
          <Route path="/he/login"    element={<LoginHe />} />
          <Route path="/workspace"    element={<LanguageProvider language="en"><WorkspaceSetupPage /></LanguageProvider>} />
          <Route path="/he/workspace" element={<LanguageProvider language="he"><WorkspaceSetupPage /></LanguageProvider>} />
          <Route path="/verify-email"       element={<LanguageProvider language="en"><VerifyEmailPage /></LanguageProvider>} />
          <Route path="/he/verify-email"   element={<LanguageProvider language="he"><VerifyEmailPage /></LanguageProvider>} />
          <Route path="/forgot-password"   element={<LanguageProvider language="en"><ForgotPassword /></LanguageProvider>} />
          <Route path="/he/forgot-password" element={<LanguageProvider language="he"><ForgotPassword /></LanguageProvider>} />
          <Route path="/reset-password"    element={<LanguageProvider language="en"><ResetPassword /></LanguageProvider>} />
          <Route path="/he/reset-password" element={<LanguageProvider language="he"><ResetPassword /></LanguageProvider>} />
          <Route path="/partners"    element={<LanguageProvider language="en"><PartnersPage /></LanguageProvider>} />
          <Route path="/he/partners" element={<LanguageProvider language="he"><PartnersPage /></LanguageProvider>} />
          <Route path="/payments"    element={<LanguageProvider language="en"><PaymentsPage /></LanguageProvider>} />
          <Route path="/he/payments" element={<LanguageProvider language="he"><PaymentsPage /></LanguageProvider>} />
          <Route path="/benefits"    element={<LanguageProvider language="en"><BenefitsPage /></LanguageProvider>} />
          <Route path="/he/benefits" element={<LanguageProvider language="he"><BenefitsPage /></LanguageProvider>} />
          <Route path="/benefits-type-2"    element={<LanguageProvider language="en"><BenefitsPageV1 /></LanguageProvider>} />
          <Route path="/he/benefits-type-2" element={<LanguageProvider language="he"><BenefitsPageV1 /></LanguageProvider>} />
          <Route path="/blog"            element={<BlogList />} />
          <Route path="/he/blog"         element={<BlogListHe />} />
          <Route path="/blog/:slug"      element={<ArticlePage />} />
          <Route path="/he/blog/:slug"   element={<ArticlePageHe />} />
          <Route path="/privacy"         element={<LanguageProvider language="en"><PrivacyPolicyPage /></LanguageProvider>} />
          <Route path="/he/privacy"      element={<LanguageProvider language="he"><PrivacyPolicyPage /></LanguageProvider>} />
          <Route path="/accessibility"   element={<LanguageProvider language="en"><AccessibilityPage /></LanguageProvider>} />
          <Route path="/he/accessibility" element={<LanguageProvider language="he"><AccessibilityPage /></LanguageProvider>} />
          <Route path="/terms"           element={<LanguageProvider language="en"><TermsOfUsePage /></LanguageProvider>} />
          <Route path="/he/terms"        element={<LanguageProvider language="he"><TermsOfUsePage /></LanguageProvider>} />
          <Route path="/he/welfare"     element={<NexusLandingPage />} />
          <Route path="/dashboard" element={
            <ProtectedRoute redirectTo="/login">
              <UserDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']} redirectTo="/login">
              <AdminDashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </Suspense>
      <ChatWidget />
      <AccessibilityWidget />
    </>
  );
}

export default App;
