import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { LanguageProvider } from './i18n/LanguageContext';

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
const PartnersPage       = lazy(() => import('./pages/PartnersPage'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
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
      <ScrollToTop />
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
          <Route path="/verify-email" element={<LanguageProvider language="en"><VerifyEmailPage /></LanguageProvider>} />
          <Route path="/partners"    element={<LanguageProvider language="en"><PartnersPage /></LanguageProvider>} />
          <Route path="/he/partners" element={<LanguageProvider language="he"><PartnersPage /></LanguageProvider>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
