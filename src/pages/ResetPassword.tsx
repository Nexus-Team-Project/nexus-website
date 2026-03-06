import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import NexusLogo from '../components/NexusLogo';
import AnimatedGradient from '../components/AnimatedGradient';
import { useLanguage } from '../i18n/LanguageContext';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { language, direction } = useLanguage();
  const isHe = language === 'he';
  const forgotPath = isHe ? '/he/forgot-password' : '/forgot-password';
  const loginPath = isHe ? '/he/login' : '/login';

  const token = new URLSearchParams(window.location.search).get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      setError(isHe ? 'הסיסמה חייבת להכיל לפחות 8 תווים.' : 'Password must be at least 8 characters.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await api.post('/api/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
      setTimeout(() => navigate(loginPath), 2500);
    } catch (err: any) {
      setError(err?.error ?? (isHe ? 'הקישור פג תוקף או לא תקין. בקש קישור חדש.' : 'Link expired or invalid. Please request a new one.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="relative h-screen bg-white flex flex-col overflow-hidden">
        <div className="fixed inset-0 z-0">
          <AnimatedGradient clipPath="polygon(40% 0, 70% 0, 90% 100%, 70% 100%)" />
        </div>
        <div className="relative z-10 flex-1 flex items-center justify-center px-8">
          <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-8 w-full max-w-md text-center" dir={direction}>
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">
              {isHe ? 'קישור לא תקין' : 'Invalid link'}
            </h1>
            <p className="text-sm text-slate-500 mb-5">
              {isHe ? 'הקישור לאיפוס סיסמה חסר או לא תקין.' : 'This reset link is missing or invalid.'}
            </p>
            <Link to={forgotPath} className="text-sm text-stripe-purple hover:underline font-semibold">
              {isHe ? 'בקש קישור איפוס חדש' : 'Request a new reset link'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-white flex flex-col overflow-hidden">
      <div className="fixed inset-0 z-0">
        <AnimatedGradient clipPath="polygon(40% 0, 70% 0, 90% 100%, 70% 100%)" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        <div className="border-b border-gray-100 flex-shrink-0">
          <div className="max-w-6xl mx-auto py-3 px-6" dir="ltr">
            <Link to="/">
              <NexusLogo height={44} variant="black" page="auth" />
            </Link>
          </div>
        </div>

        <div className="flex-1 flex items-start md:items-center justify-center px-8 pt-6 md:pt-0">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6" dir={direction}>

              {success ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <h1 className="text-xl font-bold text-slate-800 mb-2">
                    {isHe ? 'הסיסמה עודכנה!' : 'Password updated!'}
                  </h1>
                  <p className="text-sm text-slate-500">
                    {isHe ? 'מעביר אותך לדף ההתחברות…' : 'Taking you to sign in…'}
                  </p>
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-stripe-dark mb-1">
                    {isHe ? 'איפוס סיסמה' : 'Set new password'}
                  </h1>
                  <p className="text-sm text-slate-500 mb-5">
                    {isHe ? 'בחר סיסמה חזקה לחשבון שלך.' : 'Choose a strong password for your account.'}
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs text-stripe-dark font-medium mb-1">
                        {isHe ? 'סיסמה חדשה' : 'New password'}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3C4.5 3 1.73 5.61 1 9c.73 3.39 3.5 6 7 6s6.27-2.61 7-6c-.73-3.39-3.5-6-7-6zM8 12.5c-1.93 0-3.5-1.57-3.5-3.5S6.07 5.5 8 5.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5zM8 7c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/>
                            {showPassword && <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>}
                          </svg>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {isHe ? 'מינימום 8 תווים' : 'Minimum 8 characters'}
                      </p>
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button
                      type="submit"
                      disabled={isLoading || password.length < 8}
                      className={`w-full font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center ${
                        password.length >= 8 && !isLoading
                          ? 'bg-stripe-purple hover:bg-stripe-purple/90 text-white cursor-pointer'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                      }`}
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        isHe ? 'עדכן סיסמה' : 'Update password'
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
