/**
 * Builds the OTP SMS body for the wallet phone-login flow.
 *
 * Two jobs, both about getting the code into the user's input field with the
 * fewest taps while staying secure:
 *
 *  1. Human line(s): a short Hebrew message carrying the 6-digit code plus a
 *     "do not share" warning. InforU forbids URL shortening on OTP traffic, so
 *     the text is link-free.
 *  2. Origin-bound autofill line (optional): when WALLET_URL is configured, the
 *     LAST line is `@<host> #<code>` per the WebOTP / origin-bound one-time-code
 *     convention (web.dev/articles/sms-otp-form). This lets:
 *       - Android Chrome read the code automatically via the WebOTP API, and
 *       - iOS Safari (autocomplete="one-time-code") offer the code ONLY on the
 *         matching domain.
 *     The host must equal the domain the wallet is served from, so it is derived
 *     from WALLET_URL rather than hardcoded. If WALLET_URL is unset/unparseable
 *     we omit the line entirely - the code still works, it just won't autofill.
 *
 * SECURITY: the returned string contains the plaintext OTP, so callers must
 * NEVER log it (see inforu.client which redacts the message body).
 */
import { env } from '../../config/env';

/**
 * Derive the bare host the OTP line must bind to (e.g. "wallet.nexus-payment.com").
 *
 * Reads WALLET_URL from process.env first (so tests can override without
 * re-importing the parsed env), then the validated env config. Returns null when
 * no usable URL is configured or it cannot be parsed - the caller then omits the
 * origin-bound line.
 *
 * @returns the hostname, or null when unavailable.
 */
export function boundOtpHost(): string | null {
  const raw = process.env.WALLET_URL ?? env.WALLET_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname || null;
  } catch {
    // A malformed WALLET_URL must not break OTP sending - just skip autofill.
    return null;
  }
}

/**
 * Build the full OTP SMS text for a given 6-digit code.
 *
 * The origin-bound line is appended only when a host is resolvable, and is always
 * the final line of the message (required by the WebOTP / iOS autofill parsers).
 *
 * @param code the plaintext 6-digit OTP to deliver.
 * @returns the SMS body to hand to InforU.
 */
export function buildOtpSms(code: string): string {
  const human = `קוד האימות שלך הוא: ${code}\nאין לשתף קוד זה עם אף אחד.`;
  const host = boundOtpHost();
  // Blank line then `@host #code` as the LAST line - the format both Android
  // WebOTP and iOS Safari look for. Omitted when no host is configured.
  return host ? `${human}\n\n@${host} #${code}` : human;
}
