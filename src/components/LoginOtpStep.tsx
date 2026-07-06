/**
 * OTP entry step shown inside the login card when the backend answers a
 * password login with mfaRequired (privileged user on a new device).
 * Renders a 6-digit code input, verify button, resend with a 30s cooldown,
 * and a back link. Owns no auth state: calls the injected verify/resend
 * handlers and reports success upward.
 */
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

interface LoginOtpStepProps {
  /** Email the code was sent to (display only). */
  email: string;
  /** Verifies the code; resolves on success, throws ApiError-shaped objects. */
  onVerify: (code: string) => Promise<void>;
  /** Requests a fresh code for the same challenge. */
  onResend: () => Promise<void>;
  /** Returns to the password form. */
  onBack: () => void;
}

const RESEND_COOLDOWN_S = 30;

export default function LoginOtpStep({ email, onVerify, onResend, onBack }: LoginOtpStepProps) {
  const { t } = useLanguage();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** Maps backend OTP error codes to localized messages. */
  const errorMessage = (err: unknown): string => {
    const e = (typeof err === 'object' && err !== null ? err : {}) as { error?: string };
    if (e.error === 'otp_locked') return t.auth.otpLocked;
    if (e.error === 'rate_limited') return t.auth.otpRateLimited;
    return t.auth.otpInvalid;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || isVerifying) return;
    setIsVerifying(true);
    setError('');
    try {
      await onVerify(code);
    } catch (err) {
      setError(errorMessage(err));
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    try {
      await onResend();
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleVerify}>
      <div>
        <h2 className="text-lg font-bold text-nx-dark">{t.auth.otpTitle}</h2>
        <p className="text-sm text-nx-gray mt-1">
          {t.auth.otpSubtitle}{' '}
          <span className="font-semibold" dir="ltr">{email}</span>
        </p>
      </div>

      <div>
        <label htmlFor="login-otp-code" className="block text-xs text-nx-dark font-medium mb-1">
          {t.auth.otpCodeLabel}
        </label>
        <input
          id="login-otp-code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          dir="ltr"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className={`w-full px-3 py-2 border rounded-lg text-center text-xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-nx-primary/30 focus:border-nx-primary transition-colors ${
            error ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {error && (
          <p className="text-[10px] text-red-500 mt-1" role="alert">{error}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={code.length !== 6 || isVerifying}
        className={`w-full font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center ${
          code.length === 6 && !isVerifying
            ? 'bg-nx-primary hover:bg-nx-primary/90 text-white cursor-pointer'
            : 'bg-gray-300 text-gray-500 opacity-60'
        }`}
      >
        {isVerifying ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          t.auth.otpVerify
        )}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className={cooldown > 0 ? 'text-gray-400 cursor-default' : 'text-nx-primary hover:underline font-semibold cursor-pointer'}
        >
          {cooldown > 0 ? `${t.auth.otpResendIn} ${cooldown}s` : t.auth.otpResend}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-nx-gray hover:text-nx-dark cursor-pointer"
        >
          {t.auth.otpBack}
        </button>
      </div>
    </form>
  );
}
