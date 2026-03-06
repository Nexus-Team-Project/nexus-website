import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import AnimatedGradient from '../components/AnimatedGradient';
import GoogleSignIn from '../components/GoogleSignIn';
import NexusLogo from '../components/NexusLogo';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { MARKETING } from '../lib/analyticsEvents';

const countries = [
  { code: 'US', name: 'United States', nameHe: 'ארצות הברית' },
  { code: 'IL', name: 'Israel', nameHe: 'ישראל' },
];

const FlagIcon = ({ code }: { code: string }) => {
  if (code === 'US') {
    return (
      <svg width="20" height="15" viewBox="0 0 20 15" className="rounded-sm inline-block mr-2">
        <rect width="20" height="15" fill="#B22234"/>
        <path d="M0 0h20v1H0zm0 2h20v1H0zm0 2h20v1H0zm0 2h20v1H0zm0 2h20v1H0zm0 2h20v1H0zm0 2h20v1H0z" fill="white"/>
        <rect width="8" height="7" fill="#3C3B6E"/>
      </svg>
    );
  }
  return (
    <svg width="20" height="15" viewBox="0 0 220 160" className="rounded-sm inline-block mr-2">
      <rect width="220" height="160" fill="white"/>
      <rect width="220" height="15" y="25" fill="#0038b8"/>
      <rect width="220" height="15" y="120" fill="#0038b8"/>
      <path d="M 110,62 L 120,77 L 138,77 L 125,88 L 130,105 L 110,94 L 90,105 L 95,88 L 82,77 L 100,77 Z" fill="none" stroke="#0038b8" strokeWidth="3.5"/>
      <path d="M 110,88 L 120,73 L 138,73 L 125,62 L 130,45 L 110,56 L 90,45 L 95,62 L 82,73 L 100,73 Z" fill="none" stroke="#0038b8" strokeWidth="3.5"/>
    </svg>
  );
};

export default function Signup() {
  const [country, setCountry] = useState('IL');
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [showPasswordTooltip, setShowPasswordTooltip] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shouldShake, setShouldShake] = useState(false);
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [errors, setErrors] = useState({
    email: '',
    fullName: '',
    password: '',
    country: '',
  });
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  const { t, language, direction } = useLanguage();
  const { register } = useAuth();
  const navigate = useNavigate();
  const { identify, track } = useAnalytics();
  const isHe = language === 'he';
  const homePath = isHe ? '/he' : '/';
  const loginPath = isHe ? '/he/login' : '/login';
  const workspacePath = isHe ? '/he/workspace' : '/workspace';

  const features = [
    {
      title: t.auth.getStartedQuickly,
      desc: t.auth.getStartedQuicklyDesc,
    },
    {
      title: t.auth.supportAnyBusiness,
      desc: t.auth.supportAnyBusinessDesc,
    },
    {
      title: t.auth.joinMillions,
      desc: t.auth.joinMillionsDesc,
    },
  ];

  const isFormValid = email.trim() !== '' && fullName.trim() !== '' && password.trim() !== '';

  const getPasswordStrength = (pwd: string): 'weak' | 'medium' | 'strong' | null => {
    if (pwd.length === 0) return null;

    let strength = 0;

    // Check length
    if (pwd.length >= 8) strength++;
    if (pwd.length >= 12) strength++;

    // Check for numbers
    if (/\d/.test(pwd)) strength++;

    // Check for uppercase and lowercase
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;

    // Check for special characters
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) strength++;

    if (strength >= 4) return 'strong';
    if (strength >= 2) return 'medium';
    return 'weak';
  };

  const passwordStrength = getPasswordStrength(password);

  const getStrengthConfig = () => {
    switch (passwordStrength) {
      case 'strong':
        return { bars: 3, color: 'bg-green-500', text: t.auth.strong, textColor: 'text-green-500' };
      case 'medium':
        return { bars: 2, color: 'bg-orange-500', text: t.auth.medium, textColor: 'text-orange-500' };
      case 'weak':
        return { bars: 1, color: 'bg-red-500', text: t.auth.weak, textColor: 'text-red-500' };
      default:
        return { bars: 0, color: 'bg-gray-200', text: '', textColor: '' };
    }
  };

  const strengthConfig = getStrengthConfig();

  useEffect(() => {
    track(MARKETING.SIGNUP_PAGE_VIEWED, 'MARKETING', {
      referrer: document.referrer || undefined,
      source_page: window.location.pathname,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setIsCountryOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // If arriving from Login with ?resend=email, jump straight to verify screen and resend
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resendEmail = params.get('resend');
    if (resendEmail) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setVerificationEmail(resendEmail);
      setStep('verify');
      // Auto-trigger resend
      api.post('/api/auth/resend-verification', { email: resendEmail, language }).catch(() => {});
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) { clearInterval(interval); return 0; }
          return s - 1;
        });
      }, 1000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateForm = () => {
    const newErrors = {
      email: '',
      fullName: '',
      password: '',
      country: '',
    };

    if (!email.trim()) {
      newErrors.email = t.auth.emailRequired;
    }
    if (!fullName.trim()) {
      newErrors.fullName = t.auth.fullNameRequired;
    }
    if (!password.trim()) {
      newErrors.password = t.auth.passwordRequired;
    }

    setErrors(newErrors);
    return newErrors.email === '' && newErrors.fullName === '' && newErrors.password === '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      validateForm();
      return;
    }

    setIsLoading(true);

    try {
      const result = await register({ email, fullName, password, country, emailUpdates, language });
      if (result?.requiresVerification) {
        setVerificationEmail(result.email);
        setStep('verify');
      } else {
        navigate(workspacePath);
      }
    } catch (err: any) {
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 900);
      if (err?.field === 'email') {
        setErrors((prev) => ({ ...prev, email: err.error || 'Email already in use' }));
      } else if (err?.error) {
        setErrors((prev) => ({ ...prev, email: err.error }));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    await api.post('/api/auth/resend-verification', { email: verificationEmail, language }).catch(() => {});
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) { clearInterval(interval); return 0; }
        return s - 1;
      });
    }, 1000);
  }, [verificationEmail, resendCooldown]);

  const getCountryName = (c: typeof countries[0]) => isHe ? c.nameHe : c.name;

  // ── "Check your email" screen ─────────────────────────────────────────────
  if (step === 'verify') {
    return (
      <div className="relative h-screen bg-white flex flex-col overflow-hidden">
        <div className="fixed bottom-0 left-0 right-0 h-[45%] z-0">
          <AnimatedGradient clipPath="polygon(0 40%, 100% 0%, 100% 100%, 0 100%)" />
        </div>
        <div className="relative z-10 flex-1 flex flex-col">
          <div className="border-b border-gray-100 flex-shrink-0">
            <div className="max-w-6xl mx-auto py-3 px-6" dir="ltr">
              <Link to={homePath}>
                <NexusLogo height={44} variant="black" page="auth" />
              </Link>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-8 w-full max-w-md text-center" dir={direction}>
              {/* Email icon */}
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <h1 className="text-xl font-bold text-slate-800 mb-2">
                {isHe ? 'בדקו את תיבת הדואר' : 'Check your inbox'}
              </h1>
              <p className="text-sm text-slate-500 mb-1">
                {isHe ? 'שלחנו קישור אימות אל' : 'We sent a verification link to'}
              </p>
              <p className="text-sm font-semibold text-slate-700 mb-6">{verificationEmail}</p>
              <p className="text-xs text-slate-400 mb-3">
                {isHe
                  ? 'לחצו על הקישור במייל כדי להפעיל את החשבון שלכם. הקישור תקף ל-24 שעות.'
                  : 'Click the link in the email to activate your account. The link expires in 24 hours.'}
              </p>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-6">
                {isHe
                  ? '📬 לא רואים? בדקו תיקיית Updates, קידומי מכירות או ספאם'
                  : '📬 Can\'t find it? Check your Updates, Promotions or Spam folder'}
              </p>
              <button
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-sm text-indigo-600 hover:underline disabled:text-slate-400 disabled:no-underline transition-colors"
              >
                {resendCooldown > 0
                  ? (isHe ? `שליחה חוזרת בעוד ${resendCooldown} שניות` : `Resend in ${resendCooldown}s`)
                  : (isHe ? 'לא קיבלתם? שלחו שוב' : "Didn't get it? Resend email")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-white flex flex-col overflow-hidden">
      {/* Animated gradient at the bottom */}
      <div className="fixed bottom-0 left-0 right-0 h-[45%] z-0">
        <AnimatedGradient clipPath="polygon(0 40%, 100% 0%, 100% 100%, 0 100%)" />
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
        <div className="flex-1 min-h-0 flex items-start justify-center px-8 py-8 overflow-y-auto">
          <div className="max-w-6xl w-full grid lg:grid-cols-2 gap-12 items-start">
            {/* Left — value props */}
            <div className="hidden lg:block">
              <div className="space-y-6">
                {features.map((f) => (
                  <div key={f.title} className="flex gap-3">
                    <div className="w-1 bg-stripe-purple rounded-full shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-stripe-dark mb-1">{f.title}</h3>
                      <p className="text-xs text-stripe-gray leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — signup form */}
            <div className="w-full max-w-md mx-auto lg:mx-0">
              <div className={`bg-white rounded-xl shadow-xl border border-gray-100 p-6 ${shouldShake ? 'animate-shake' : ''}`}>
                <h1 className="text-xl font-bold text-stripe-dark mb-5 max-w-sm mx-auto">
                  {t.auth.createAccount}
                </h1>

                <form className="space-y-3 max-w-sm mx-auto" onSubmit={handleSubmit}>
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

                  <div>
                    <label className="block text-xs text-stripe-dark font-medium mb-1">{t.auth.fullName}</label>
                    <input
                      type="text"
                      name="name"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors ${
                        errors.fullName ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.fullName && (
                      <div className="flex items-center gap-1 mt-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-red-500">
                          <path d="M6 0C2.7 0 0 2.7 0 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm.6 9H5.4V7.8h1.2V9zm0-2.4H5.4V3h1.2v3.6z" fill="currentColor"/>
                        </svg>
                        <span className="text-[10px] text-red-500">{errors.fullName}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-stripe-dark font-medium mb-1">{t.auth.password}</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        autoComplete="new-password"
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
                      <div className="flex items-center gap-1 mt-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-red-500">
                          <path d="M6 0C2.7 0 0 2.7 0 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm.6 9H5.4V7.8h1.2V9zm0-2.4H5.4V3h1.2v3.6z" fill="currentColor"/>
                        </svg>
                        <span className="text-[10px] text-red-500">{errors.password}</span>
                      </div>
                    )}

                    {/* Password Strength Indicator */}
                    {password && passwordStrength && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3].map((bar) => (
                            <div
                              key={bar}
                              className={`h-1 flex-1 rounded-full transition-colors ${
                                bar <= strengthConfig.bars ? strengthConfig.color : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className={`text-[10px] font-medium ${strengthConfig.textColor}`}>
                          {strengthConfig.text}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-stripe-dark font-medium mb-1">
                      {t.auth.country} <span className="text-stripe-gray/60 cursor-help">&#9432;</span>
                    </label>
                    <div className="relative" ref={countryDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsCountryOpen(!isCountryOpen)}
                        className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors ${isHe ? 'pl-10' : 'pr-10'} text-${isHe ? 'right' : 'left'} flex items-center ${
                          errors.country ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <FlagIcon code={country} />
                        <span>{getCountryName(countries.find(c => c.code === country)!)}</span>
                        <div className={`absolute ${isHe ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-gray-400 text-xs`}>
                          &#9660;
                        </div>
                      </button>

                      {isCountryOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden z-10">
                          {countries.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => {
                                setCountry(c.code);
                                setIsCountryOpen(false);
                              }}
                              className={`w-full flex items-center px-3 py-2 text-sm text-${isHe ? 'right' : 'left'} transition-colors ${
                                country === c.code
                                  ? 'bg-stripe-purple/10 text-stripe-purple'
                                  : 'text-stripe-dark hover:bg-slate-50'
                              }`}
                            >
                              <FlagIcon code={c.code} />
                              <span>{getCountryName(c)}</span>
                              {country === c.code && (
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  className={`${isHe ? 'mr-auto' : 'ml-auto'}`}
                                >
                                  <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {errors.country && (
                      <div className="flex items-center gap-1 mt-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-red-500">
                          <path d="M6 0C2.7 0 0 2.7 0 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm.6 9H5.4V7.8h1.2V9zm0-2.4H5.4V3h1.2v3.6z" fill="currentColor"/>
                        </svg>
                        <span className="text-[10px] text-red-500">{errors.country}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={emailUpdates}
                      onChange={(e) => setEmailUpdates(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-stripe-purple focus:ring-stripe-purple/30"
                    />
                    <span className="text-[11px] text-stripe-gray leading-relaxed">
                      {t.auth.emailUpdates}{' '}
                      <a href="#" className="text-stripe-purple hover:underline">{t.auth.unsubscribe}</a> {t.auth.atAnyTime}{' '}
                      <a href="#" className="text-stripe-purple hover:underline">{t.auth.privacyPolicy}</a>
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full font-medium py-2 rounded-lg transition-colors text-sm flex items-center justify-center ${
                      isFormValid && !isLoading
                        ? 'bg-stripe-purple hover:bg-stripe-purple/90 text-white cursor-pointer'
                        : 'bg-gray-300 text-gray-500 cursor-pointer opacity-60'
                    }`}
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      t.auth.createAccountButton
                    )}
                  </button>
                </form>

                <div className="max-w-sm mx-auto">
                  {/* Divider */}
                  <div className="flex items-center gap-4 my-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-stripe-gray">{t.auth.or}</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  {/* Google sign up */}
                  <GoogleSignIn redirectTo={workspacePath} />
                </div>

                {/* Already have account */}
                <div className="text-center mt-4 pt-3 -mx-6 -mb-6 px-6 pb-3 bg-cyan-900/5 rounded-b-xl">
                  <p className="text-xs text-stripe-gray">
                    {t.auth.alreadyHaveAccount}{' '}
                    <Link to={loginPath} className="text-stripe-purple hover:underline font-medium">{t.auth.signIn}</Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Footer - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 py-3 px-8" dir="ltr">
        <div className="max-w-6xl mx-auto flex items-center gap-6">
          <span className="text-xs text-white/80 font-medium">{t.auth.copyright}</span>
          <a href="#" className="text-xs text-white/80 hover:text-white font-medium">{t.auth.privacyTerms}</a>
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
