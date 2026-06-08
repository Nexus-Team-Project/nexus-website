/**
 * Client-side schema + validation helpers for the contact-sales form.
 *
 * Mirrors the server-side rules so the user gets fast, localised feedback
 * before a request leaves the browser. The server remains the source of
 * truth — these helpers exist only to short-circuit obviously bad input.
 */

/** Maximum characters accepted for the free-text message. Mirrors backend. */
export const MESSAGE_MAX_LENGTH = 1000;

/** Minimum characters required for the free-text message. Mirrors backend. */
export const MESSAGE_MIN_LENGTH = 10;

/** Maximum characters accepted for the optional name field. Mirrors backend. */
export const NAME_MAX_LENGTH = 100;

/** Form errors returned by {@link validateContactForm}. */
export interface ContactFormErrors {
  email?: 'errorEmail';
  phone?: 'errorPhone';
  message?: 'errorMessageShort' | 'errorMessageLong';
}

/** Raw form values held by ContactSalesModal. */
export interface ContactFormState {
  name: string;
  email: string;
  phone: string;
  message: string;
}

/**
 * Validate the form before submission.
 *
 * Inputs: the modal's current form values.
 * Output: a map of translation keys, one per invalid field. Empty object
 *         means the form may be submitted.
 */
export function validateContactForm(values: ContactFormState): ContactFormErrors {
  const errors: ContactFormErrors = {};

  const trimmedEmail = values.email.trim();
  if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
    errors.email = 'errorEmail';
  }

  if (values.phone.trim() && !isValidPhoneShape(values.phone.trim())) {
    errors.phone = 'errorPhone';
  }

  const trimmedMessage = values.message.trim();
  if (trimmedMessage.length < MESSAGE_MIN_LENGTH) {
    errors.message = 'errorMessageShort';
  } else if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
    errors.message = 'errorMessageLong';
  }

  return errors;
}

/**
 * Lightweight RFC-5322-ish email check. Final validation lives on the server.
 *
 * Inputs: a candidate email string.
 * Output: true when the value looks like an email address.
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Loose phone-shape check. react-phone-number-input enforces E.164 but we
 * still guard manually so a paste that bypasses the widget can be caught.
 *
 * Inputs: a candidate phone string.
 * Output: true when the value contains 6–20 valid phone characters.
 */
export function isValidPhoneShape(value: string): boolean {
  return /^\+?[0-9\s().-]{6,20}$/.test(value);
}
