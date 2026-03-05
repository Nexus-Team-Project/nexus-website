import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import NexusLogo from '../components/NexusLogo';
import AnimatedGradient from '../components/AnimatedGradient';
import { useLanguage } from '../i18n/LanguageContext';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const { language } = useLanguage();
  const isHe = language === 'he';
  const loginPath = isHe ? '/he/login' : '/login';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
            <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6">

              {submitted ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <h1 className="text-xl font-bold text-slate-800 mb-2">Check your email</h1>
                  <p className="text-sm text-slate-500 mb-5">
                    If <span className="font-medium text-slate-700">{email}</span> is registered, you'll receive a reset link shortly.
                  </p>
                  <Link to={loginPath} className="text-sm text-stripe-purple hover:underline font-semibold">
                    Back to sign in
                  </Link>
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-stripe-dark mb-1">Reset your password</h1>
                  <p className="text-sm text-slate-500 mb-5">
                    Enter your email and we'll send you a reset link.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs text-stripe-dark font-medium mb-1">Email</label>
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors"
                      />
                    </div>

                    {error && (
                      <p className="text-xs text-red-500">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading || !email.trim()}
                      className={`w-full font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center ${
                        email.trim() && !isLoading
                          ? 'bg-stripe-purple hover:bg-stripe-purple/90 text-white cursor-pointer'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                      }`}
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Send reset link'
                      )}
                    </button>
                  </form>

                  <div className="text-center mt-4 pt-4 -mx-6 -mb-6 px-6 pb-4 bg-slate-50 rounded-b-xl border-t border-gray-100">
                    <Link to={loginPath} className="text-sm text-stripe-gray hover:text-stripe-purple font-medium">
                      ← Back to sign in
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
