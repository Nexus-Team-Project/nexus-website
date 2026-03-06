import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { LanguageProvider } from './i18n/LanguageContext';
import { useAnalytics } from './hooks/useAnalytics';
import ProtectedRoute from './components/ProtectedRoute';

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
const AdminDashboard     = lazy(() => import('./pages/AdminDashboard'));
const UserDashboard      = lazy(() => import('./pages/UserDashboard'));

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

function App() {
  return (
    <BrowserRouter>
      <RouteAnalytics />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"         element={<Home />} />
          <Route path="/he"       element={<HomeHe />} />
          <Route path="/signup"   element={<LanguageProvider language="en"><Signup /></LanguageProvider>} />
          <Route path="/login"    element={<LanguageProvider language="en"><Login /></LanguageProvider>} />
          <Route path="/he/signup"   element={<SignupHe />} />
          <Route path="/he/login"    element={<LoginHe />} />
          <Route path="/workspace"    element={<LanguageProvider language="en"><WorkspaceSetupPage /></LanguageProvider>} />
          <Route path="/he/workspace" element={<LanguageProvider language="he"><WorkspaceSetupPage /></LanguageProvider>} />
          <Route path="/verify-email"     element={<LanguageProvider language="en"><VerifyEmailPage /></LanguageProvider>} />
          <Route path="/forgot-password"  element={<LanguageProvider language="en"><ForgotPassword /></LanguageProvider>} />
          <Route path="/he/forgot-password" element={<LanguageProvider language="he"><ForgotPassword /></LanguageProvider>} />
          <Route path="/reset-password"   element={<LanguageProvider language="en"><ResetPassword /></LanguageProvider>} />
          <Route path="/partners"    element={<LanguageProvider language="en"><PartnersPage /></LanguageProvider>} />
          <Route path="/he/partners" element={<LanguageProvider language="he"><PartnersPage /></LanguageProvider>} />
          <Route path="/payments"    element={<LanguageProvider language="en"><PaymentsPage /></LanguageProvider>} />
          <Route path="/he/payments" element={<LanguageProvider language="he"><PaymentsPage /></LanguageProvider>} />
          <Route path="/dashboard" element={
            <ProtectedRoute redirectTo="/login">
              <UserDashboard />
            </ProtectedRoute>
          } />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/admin" element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']} redirectTo="/login">
              <AdminDashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
