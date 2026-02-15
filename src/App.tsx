import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import HomeHe from './pages/HomeHe';
import Signup from './pages/Signup';
import Login from './pages/Login';
import SignupHe from './pages/SignupHe';
import LoginHe from './pages/LoginHe';
import { LanguageProvider } from './i18n/LanguageContext';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/he" element={<HomeHe />} />
        <Route path="/signup" element={<LanguageProvider language="en"><Signup /></LanguageProvider>} />
        <Route path="/login" element={<LanguageProvider language="en"><Login /></LanguageProvider>} />
        <Route path="/he/signup" element={<SignupHe />} />
        <Route path="/he/login" element={<LoginHe />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
