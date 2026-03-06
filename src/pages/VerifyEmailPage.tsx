import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setAccessToken } from '../lib/api';
import NexusLogo from '../components/NexusLogo';
import AnimatedGradient from '../components/AnimatedGradient';
import { useLanguage } from '../i18n/LanguageContext';

type Status = 'verifying' | 'success' | 'error' | 'expired';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>('verifying');
  const navigate = useNavigate();
  const { language, direction } = useLanguage();
  const isHe = language === 'he';
  const signupPath = isHe ? '/he/signup' : '/signup';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      return;
    }

    api.post<{ accessToken: string }>('/api/auth/verify-email', { token })
      .then(async (data) => {
        setAccessToken(data.accessToken);
        const profile = await api.get<{ fullName?: string }>('/api/auth/me').catch(() => null);
        if (profile?.fullName) {
          sessionStorage.setItem('auth_first_name', profile.fullName.split(' ')[0]);
        }
        setStatus('success');
        setTimeout(() => window.location.replace('/workspace'), 2500);
      })
      .catch((err) => {
        if (err?.status === 400) {
          setStatus('expired');
        } else {
          setStatus('error');
        }
      });
  }, [navigate]);

  return (
    <div className="relative h-screen bg-white flex flex-col overflow-hidden">
      <div className="fixed bottom-0 left-0 right-0 h-[45%] z-0">
        <AnimatedGradient clipPath="polygon(0 40%, 100% 0%, 100% 100%, 0 100%)" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        <div className="border-b border-gray-100 flex-shrink-0">
          <div className="max-w-6xl mx-auto py-3 px-6" dir="ltr">
            <Link to="/">
              <NexusLogo height={44} variant="black" page="auth" />
            </Link>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-8">
          <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-8 w-full max-w-md text-center" dir={direction}>

            {status === 'verifying' && (
              <>
                <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-5" />
                <h1 className="text-xl font-bold text-slate-800 mb-2">
                  {isHe ? 'מאמת את המייל שלך…' : 'Verifying your email…'}
                </h1>
                <p className="text-sm text-slate-400">
                  {isHe ? 'רק רגע, בבקשה.' : 'Just a moment, please.'}
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-slate-800 mb-2">
                  {isHe ? 'המייל אומת בהצלחה!' : 'Email verified!'}
                </h1>
                <p className="text-sm text-slate-500">
                  {isHe ? 'מעביר אותך לסביבת העבודה…' : 'Taking you to your workspace…'}
                </p>
              </>
            )}

            {status === 'expired' && (
              <>
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-slate-800 mb-2">
                  {isHe ? 'הקישור פג תוקף' : 'Link expired'}
                </h1>
                <p className="text-sm text-slate-500 mb-5">
                  {isHe
                    ? 'קישור האימות פג תוקף או שכבר נעשה בו שימוש.'
                    : 'This verification link has expired or already been used.'}
                </p>
                <Link
                  to={signupPath}
                  className="text-sm text-indigo-600 hover:underline font-medium"
                >
                  {isHe ? 'חזרה להרשמה לבקשת קישור חדש' : 'Back to sign up to request a new link'}
                </Link>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-slate-800 mb-2">
                  {isHe ? 'האימות נכשל' : 'Verification failed'}
                </h1>
                <p className="text-sm text-slate-500 mb-5">
                  {isHe
                    ? 'משהו השתבש. נסה שוב או פנה לתמיכה.'
                    : 'Something went wrong. Please try again or contact support.'}
                </p>
                <Link
                  to={signupPath}
                  className="text-sm text-indigo-600 hover:underline font-medium"
                >
                  {isHe ? 'חזרה להרשמה' : 'Back to sign up'}
                </Link>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
