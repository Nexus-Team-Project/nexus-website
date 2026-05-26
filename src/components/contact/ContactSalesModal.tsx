/**
 * ContactSalesModal — public, unauthenticated lead-capture form.
 *
 * Opened from the floating "Contact sales" button. Collects an email
 * (required), an optional phone with country flag/prefix selector, and a
 * length-limited free-text message. Submits to /api/v1/contact-sales and
 * shows a localised success / error state inline.
 *
 * Security posture:
 *   - Client-side validation mirrors backend bounds (10–1000 chars, etc.).
 *   - Server is the source of truth; this component never trusts its own
 *     state for security decisions, only for UX.
 *   - The phone input uses react-phone-number-input which guarantees
 *     E.164 output via the onChange contract.
 *   - The modal locks body scroll and traps Escape so it composes well with
 *     the existing layout (z-[200] sits above the FAB at z-50).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import { useLanguage } from '../../i18n/LanguageContext';
import { submitContactSales, type ContactSalesError } from '../../lib/contactSalesApi';
import {
  MESSAGE_MAX_LENGTH,
  type ContactFormErrors,
  type ContactFormState,
  validateContactForm,
} from './contactFormSchema';

interface ContactSalesModalProps {
  /** When false the modal renders nothing. */
  open: boolean;
  /** Called when the user closes the modal (X button, Escape, backdrop). */
  onClose: () => void;
}

/** Initial value for every render of the form. */
const EMPTY_STATE: ContactFormState = {
  name: '',
  email: '',
  phone: '',
  message: '',
};

/**
 * Lock document body scroll while the modal is open and restore it on close.
 *
 * Inputs: a boolean signalling whether the modal is currently visible.
 * Output: side effect only; no return value.
 */
function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/**
 * Close the modal when the user presses Escape.
 *
 * Inputs: active flag + handler to invoke on Escape.
 * Output: side effect only.
 */
function useEscapeToClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onClose]);
}

export default function ContactSalesModal({ open, onClose }: ContactSalesModalProps) {
  const { t, language, direction } = useLanguage();
  const copy = t.contactForm;

  const [values, setValues] = useState<ContactFormState>(EMPTY_STATE);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'success'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useBodyScrollLock(open);
  useEscapeToClose(open, onClose);

  // Reset form whenever the modal re-opens so a previous send doesn't linger.
  useEffect(() => {
    if (!open) return;
    setValues(EMPTY_STATE);
    setErrors({});
    setServerError(null);
    setSubmitState('idle');
    // Defer focus so the input is actually mounted.
    requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [open]);

  const charactersLeft = useMemo(
    () => Math.max(0, MESSAGE_MAX_LENGTH - values.message.length),
    [values.message],
  );

  /**
   * Resolve an error translation key to its localised string.
   *
   * Inputs: the key produced by client-side validation.
   * Output: the user-facing error string in the active language.
   */
  function errorText(key: keyof ContactFormErrors): string | undefined {
    const error = errors[key];
    if (!error) return undefined;
    return copy[error];
  }

  /**
   * Map a typed server error to a localised user-facing message.
   *
   * Inputs: the rejection thrown by submitContactSales.
   * Output: the localised text shown above the submit button.
   */
  function serverErrorText(err: ContactSalesError): string {
    if (err.rateLimited) return copy.errorRateLimited;
    if (err.message === 'network') return copy.errorNetwork;
    if (err.validation) return copy.errorServer;
    return copy.errorServer;
  }

  /**
   * Handle the submit event for the form.
   *
   * Inputs: the synthetic form event from the browser.
   * Output: side effect — updates submit state, errors, and dispatches the
   *         POST request.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitState === 'sending') return;

    const nextErrors = validateContactForm(values);
    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitState('sending');
    try {
      await submitContactSales({
        email: values.email.trim(),
        phone: values.phone.trim() || undefined,
        name: values.name.trim() || undefined,
        message: values.message.trim(),
        language,
        page: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });
      setSubmitState('success');
    } catch (err) {
      setSubmitState('idle');
      setServerError(serverErrorText(err as ContactSalesError));
    }
  }

  if (!open) return null;

  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5';
  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-nx-primary focus:ring-2 focus:ring-nx-primary/20 transition-colors';
  const errorClass = 'mt-1.5 text-xs text-red-600';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-sales-title"
      dir={direction}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={copy.close}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm cursor-default"
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
          <div className="min-w-0">
            <h2 id="contact-sales-title" className="text-xl font-bold text-slate-900">
              {copy.title}
            </h2>
            {submitState !== 'success' && (
              <p className="mt-1 text-sm text-slate-600">{copy.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label={copy.close}
          >
            <X size={20} />
          </button>
        </div>

        {submitState === 'success' ? (
          <div className="px-6 pb-6 pt-2">
            <div className="flex flex-col items-center text-center gap-3 py-8">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="text-emerald-600" size={28} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{copy.successTitle}</h3>
              <p className="text-sm text-slate-600 max-w-sm">{copy.successBody}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-2 bg-nx-primary text-white font-semibold px-6 py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity text-sm"
              >
                {copy.close}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto px-6 pb-6 pt-2" noValidate>
            <div>
              <label htmlFor="contact-name" className={labelClass}>{copy.nameLabel}</label>
              <input
                id="contact-name"
                ref={firstFieldRef}
                type="text"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                maxLength={100}
                autoComplete="name"
                className={inputClass}
                placeholder={copy.namePlaceholder}
              />
            </div>

            <div>
              <label htmlFor="contact-email" className={labelClass}>
                {copy.emailLabel} <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-email"
                type="email"
                required
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                maxLength={254}
                autoComplete="email"
                className={inputClass}
                placeholder={copy.emailPlaceholder}
                aria-invalid={!!errors.email}
              />
              {errorText('email') && <p className={errorClass}>{errorText('email')}</p>}
            </div>

            <div>
              <label htmlFor="contact-phone" className={labelClass}>{copy.phoneLabel}</label>
              <PhoneInput
                id="contact-phone"
                international
                defaultCountry={language === 'he' ? 'IL' : 'US'}
                value={values.phone || undefined}
                onChange={(value) => setValues((v) => ({ ...v, phone: value ?? '' }))}
                className="rpni-shell"
                numberInputProps={{
                  className: inputClass,
                  autoComplete: 'tel',
                  maxLength: 20,
                  'aria-invalid': !!errors.phone,
                }}
              />
              {errorText('phone') && <p className={errorClass}>{errorText('phone')}</p>}
            </div>

            <div>
              <label htmlFor="contact-message" className={labelClass}>
                {copy.messageLabel} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="contact-message"
                required
                value={values.message}
                onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
                maxLength={MESSAGE_MAX_LENGTH}
                rows={5}
                className={`${inputClass} resize-y min-h-[120px]`}
                placeholder={copy.messagePlaceholder}
                aria-invalid={!!errors.message}
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                {errorText('message') ? (
                  <p className={errorClass}>{errorText('message')}</p>
                ) : <span />}
                <p className="text-xs text-slate-400">{charactersLeft} {copy.charactersRemaining}</p>
              </div>
            </div>

            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitState === 'sending'}
              className="mt-1 inline-flex items-center justify-center gap-2 bg-nx-primary text-white font-semibold px-6 py-3 rounded-lg shadow-sm hover:opacity-90 transition-opacity text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitState === 'sending' ? copy.submitting : copy.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
