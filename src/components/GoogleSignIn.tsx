import { useLanguage } from '../i18n/LanguageContext';
import { useState } from 'react';

interface GoogleSignInProps {
  variant?: 'hero' | 'form';
  /** Path to navigate to after successful Google OAuth. Stored in sessionStorage
   *  because the OAuth flow does a full-page redirect — callbacks can't survive it. */
  redirectTo?: string;
  onSuccess?: () => void; // kept for API compat; use redirectTo instead
  onError?: () => void;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const REDIRECT_URI = window.location.origin;

export default function GoogleSignIn({ variant = 'form', redirectTo = '/workspace' }: GoogleSignInProps) {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = () => {
    setIsLoading(true);
    // Persist the intended destination across the full-page OAuth redirect.
    // AuthContext reads this after the token callback and navigates accordingly.
    sessionStorage.setItem('google_oauth_redirect', redirectTo);
    const scope = encodeURIComponent('email profile');
    const redirectUri = encodeURIComponent(REDIRECT_URI);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    window.location.href = url;
  };

  const buttonStyles =
    variant === 'hero'
      ? 'inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3.5 sm:py-4 border border-gray-300 rounded-lg shadow-sm bg-white text-xs sm:text-sm font-bold text-stripe-dark hover:bg-gray-50 hover:border-stripe-purple transition-colors whitespace-nowrap disabled:opacity-60'
      : 'w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-200 rounded-lg shadow-sm bg-white text-sm font-semibold text-stripe-dark hover:bg-gray-50 hover:border-stripe-purple transition-colors disabled:opacity-60';

  return (
    <button
      onClick={handleGoogleLogin}
      disabled={isLoading}
      className={buttonStyles}
    >
      {isLoading ? (
        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
        </svg>
      )}
      {t.buttons.signUpWithGoogle}
    </button>
  );
}