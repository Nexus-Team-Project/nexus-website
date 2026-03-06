import { useState } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import AnimatedGradient from '../components/AnimatedGradient';
import GoogleSignIn from '../components/GoogleSignIn';
import NexusLogo from '../components/NexusLogo';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordTooltip, setShowPasswordTooltip] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shouldShake, setShouldShake] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [errors, setErrors] = useState({
    email: '',
    password: '',
  });

  const { t, language, direction } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const { identify } = useAnalytics();
  const isHe = language === 'he';
  const homePath = isHe ? '/he' : '/';
  const signupPath = isHe ? '/he/signup' : '/signup';
  const workspacePath = isHe ? '/he/workspace' : '/workspace';
  const dashboardPath = isHe ? '/he/dashboard' : '/dashboard';
  const adminPath = isHe ? '/he/admin' : '/admin';

  const getPostLoginPath = (user: { role: string; onboardingDone: boolean }) => {
    if (user.role === 'ADMIN') return adminPath;
    if (user.onboardingDone) return dashboardPath;
    return workspacePath;
  };

  const isFormValid = email.trim() !== '' && password.trim() !== '';

  const validateForm = () => {
    const newErrors = {
      email: '',
      password: '',
    };

    if (!email.trim()) {
      newErrors.email = t.auth.emailRequired;
    }
    if (!password.trim()) {
      newErrors.password = t.auth.passwordRequired;
    }

    setErrors(newErrors);
    return newErrors.email === '' && newErrors.password === '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      validateForm();
      return;
    }

    setIsLoading(true);

    try {
      const user = await login(email, password, rememberMe);
      identify(user.id, 'login');
      navigate(getPostLoginPath(user));
    } catch (err: any) {
      setIsLoading(false);
      // 403 = registered but email not verified yet
      if (err?.status === 403) {
        setUnverifiedEmail(email.trim().toLowerCase());
        return;
      }
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 900);
      if (err?.error) {
        setErrors((prev) => ({ ...prev, password: err.error }));
      }
    }
  };

  return (
    <div className="relative h-screen bg-white flex flex-col overflow-hidden">
      {/* Animated gradient diagonal stripe */}
      <div className="fixed inset-0 z-0">
        <AnimatedGradient clipPath={isHe ? "polygon(30% 0, 60% 0, 80% 100%, 60% 100%)" : "polygon(40% 0, 70% 0, 90% 100%, 70% 100%)"} />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col">
        {/* Top bar */}
        <div className="border-b border-gray-100 flex-shrink-0">
          <div className="max-w-6xl mx-auto py-3 px-6" dir="ltr">
            <Link to={homePath}>
              <NexusLogo height={44} variant="black" page="auth" />
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-start md:items-center justify-center px-8 pt-6 md:pt-0 overflow-y-auto">
          <div className="w-full max-w-md">
            <div className={`bg-white rounded-xl shadow-xl border border-gray-100 p-6 ${shouldShake ? 'animate-shake' : ''}`}>
              <h1 className="text-xl font-bold text-stripe-dark mb-5">
                {t.auth.signInToAccount}
              </h1>

              {unverifiedEmail && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  Please verify your email before logging in.{' '}
                  <Link
                    to={`${signupPath}?resend=${encodeURIComponent(unverifiedEmail)}`}
                    className="font-semibold underline hover:text-amber-900"
                  >
                    Resend verification email
                  </Link>
                </div>
              )}

              <form className="space-y-3" onSubmit={handleSubmit}>
                {/* Email Field */}
                <div>
                  <label className="block text-xs text-stripe-dark font-medium mb-1">{t.auth.email}</label>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors ${
                      errors.email ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.email && (
                    <div className="flex items-center gap-1 mt-1">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-red-500">
                        <path d="M6 0C2.7 0 0 2.7 0 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm.6 9H5.4V7.8h1.2V9zm0-2.4H5.4V3h1.2v3.6z" fill="currentColor"/>
                      </svg>
                      <span className="text-[10px] text-red-500">{errors.email}</span>
                    </div>
                  )}
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-stripe-dark font-medium">{t.auth.password}</label>
                    <Link to={isHe ? '/he/forgot-password' : '/forgot-password'} className="text-[10px] font-semibold text-stripe-purple hover:text-stripe-purple/80">
                      {t.auth.forgotYourPassword}
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full px-3 py-2 ${isHe ? 'pl-10' : 'pr-10'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors ${
                        errors.password ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      onMouseEnter={() => setShowPasswordTooltip(true)}
                      onMouseLeave={() => setShowPasswordTooltip(false)}
                      className={`absolute ${isHe ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors`}
                    >
                      {showPassword ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 3C4.5 3 1.73 5.61 1 9c.73 3.39 3.5 6 7 6s6.27-2.61 7-6c-.73-3.39-3.5-6-7-6zM8 12.5c-1.93 0-3.5-1.57-3.5-3.5S6.07 5.5 8 5.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5zM8 7c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/>
                          <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 3C4.5 3 1.73 5.61 1 9c.73 3.39 3.5 6 7 6s6.27-2.61 7-6c-.73-3.39-3.5-6-7-6zM8 12.5c-1.93 0-3.5-1.57-3.5-3.5S6.07 5.5 8 5.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5zM8 7c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/>
                        </svg>
                      )}
                    </button>

                    {/* Tooltip */}
                    {showPasswordTooltip && (
                      <div className={`absolute top-1/2 -translate-y-1/2 ${isHe ? 'right-full mr-2' : 'left-full ml-2'} bg-slate-900 text-white px-2 py-1 rounded text-[10px] whitespace-nowrap z-50`}>
                        {showPassword ? t.auth.hidePassword : t.auth.showPassword}
                      </div>
                    )}
                  </div>
                  {errors.password && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-red-500">
                        <path d="M6 0C2.7 0 0 2.7 0 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm.6 9H5.4V7.8h1.2V9zm0-2.4H5.4V3h1.2v3.6z" fill="currentColor"/>
                      </svg>
                      <span className="text-[9px] text-red-500">{errors.password}</span>
                    </div>
                  )}
                </div>

                {/* Remember Me */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-stripe-purple focus:ring-stripe-purple/30 cursor-pointer"
                    id="remember-me"
                  />
                  <label htmlFor="remember-me" className={`${isHe ? 'mr-2' : 'ml-2'} block text-sm text-stripe-gray cursor-pointer`}>
                    {t.auth.rememberMeDevice}
                  </label>
                </div>

                {/* Sign In Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center ${
                    isFormValid && !isLoading
                      ? 'bg-stripe-purple hover:bg-stripe-purple/90 text-white cursor-pointer'
                      : 'bg-gray-300 text-gray-500 cursor-pointer opacity-60'
                  }`}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    t.auth.signInButton
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="px-3 bg-white text-gray-400 font-semibold tracking-wider">{t.auth.or}</span>
                </div>
              </div>

              {/* Social Sign In */}
              <div className="space-y-3">
                <GoogleSignIn redirectTo={workspacePath} />
              </div>

              {/* New User Link */}
              <div className="text-center mt-4 pt-4 -mx-6 -mb-6 px-6 pb-4 bg-slate-50 rounded-b-xl border-t border-gray-100">
                <p className="text-sm text-stripe-gray">
                  {t.auth.newToNexus}{' '}
                  <Link to={signupPath} className="text-stripe-purple hover:underline font-semibold">
                    {t.auth.createAccountLink}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 py-3 px-8" dir="ltr">
        <div className="max-w-6xl mx-auto flex items-center gap-6">
          <span className="text-xs text-stripe-dark font-medium">{t.auth.copyright}</span>
          <a href="#" className="text-xs text-stripe-dark hover:text-stripe-purple font-medium">{t.auth.privacyTerms}</a>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          8%, 24%, 40%, 56%, 72% { transform: translateX(-8px); }
          16%, 32%, 48%, 64%, 80% { transform: translateX(8px); }
          88% { transform: translateX(-4px); }
          94% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.9s ease-in-out;
        }
      `}</style>
    </div>
  );
}
