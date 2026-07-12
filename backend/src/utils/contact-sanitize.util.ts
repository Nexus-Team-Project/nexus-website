/**
 * Sanitization helpers for the public contact-sales form.
 *
 * The contact form is unauthenticated, so every field that ever ends up in
 * an email template or log line passes through these helpers first. The
 * goal is to neutralise three classes of attacks:
 *
 *   1. HTML / script injection that would render inside an email client
 *   2. Header injection (newlines that smuggle a Bcc:, Reply-To:, etc.)
 *   3. Control-character noise that breaks rendering or hides text
 *
 * The functions never throw; invalid input becomes an empty string so the
 * Zod schema in the route stays the single source of truth for "required".
 */

/** Maximum allowed characters for the free-text message field. */
export const CONTACT_MESSAGE_MAX_LENGTH = 1000;

/** Minimum characters required so we don't ship empty-noise messages. */
export const CONTACT_MESSAGE_MIN_LENGTH = 10;

/** Maximum length for the optional name field. */
export const CONTACT_NAME_MAX_LENGTH = 100;

// ─── Regex constants ─────────────────────────────────────────────────────────
//
// `\x00-\x1F` is the C0 control range, `\x7F` is DEL. We build the patterns
// from string literals + `new RegExp(...)` so the source file stays plain
// ASCII (literal control bytes in a .ts file are a portability hazard).

// eslint-disable-next-line no-control-regex -- control characters are matched intentionally to strip them from untrusted input
const CONTROL_CHARS_RE = new RegExp('[\\x00-\\x1F\\x7F]', 'g');

// Same as CONTROL_CHARS_RE but excluding tab (\x09), LF (\x0A), CR (\x0D)
// so the multi-line message can keep its line endings before they get
// normalised.
// eslint-disable-next-line no-control-regex -- control characters are matched intentionally to strip them from untrusted input
const NON_LINE_CONTROL_CHARS_RE = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', 'g');

/**
 * Escape any character that has special meaning inside HTML.
 *
 * Inputs: untrusted user text destined for an email HTML body.
 * Output: HTML-safe text that cannot produce markup or scripts.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip ASCII C0 controls and DEL.
 *
 * Inputs: raw user input that may contain stray control bytes.
 * Output: a string with all control characters removed.
 */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS_RE, '');
}

/**
 * Remove CR/LF so the value can never inject extra email headers.
 *
 * Inputs: a single-line field (name, email, phone, subject).
 * Output: the value with all CR and LF characters replaced by a space.
 */
export function stripNewlines(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}

/**
 * Collapse runs of horizontal whitespace to a single space and trim ends.
 *
 * Inputs: text that may contain padding or repeated whitespace.
 * Output: a trimmed string with single-space separators.
 */
export function collapseWhitespace(value: string): string {
  return value.replace(/[ \t]+/g, ' ').trim();
}

/**
 * Normalise an email address: strip controls + newlines, trim, lowercase.
 *
 * Inputs: a candidate email string from the form.
 * Output: a normalised string. Final RFC validity is checked by Zod.
 */
export function sanitizeEmail(value: string): string {
  return collapseWhitespace(stripNewlines(stripControlChars(value))).toLowerCase();
}

/**
 * Normalise an E.164 phone number to digits with at most one leading '+'.
 *
 * Inputs: a phone string that may contain spaces, dashes, or parentheses.
 * Output: a compact phone string suitable for storage and display.
 */
export function sanitizePhone(value: string): string {
  const cleaned = stripNewlines(stripControlChars(value)).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return `+${cleaned.slice(1).replace(/\+/g, '')}`;
  }
  return cleaned.replace(/\+/g, '');
}

/**
 * Sanitise a short single-line field (name, company, etc.).
 *
 * Inputs: raw text + a maximum allowed length.
 * Output: control-free, newline-free, whitespace-normalised, length-capped text.
 */
export function sanitizeShortText(value: string, maxLength: number): string {
  return collapseWhitespace(stripNewlines(stripControlChars(value))).slice(0, maxLength);
}

/**
 * Sanitise the multi-line message field while preserving paragraph breaks.
 *
 * Inputs: raw text from the textarea.
 * Output: control-stripped text with normalised newlines, length-capped to
 *         CONTACT_MESSAGE_MAX_LENGTH characters.
 */
export function sanitizeMessage(value: string): string {
  const normalisedNewlines = value.replace(/\r\n?/g, '\n');
  const noControls = normalisedNewlines.replace(NON_LINE_CONTROL_CHARS_RE, '');
  const trimmed = noControls
    .replace(/\n{3,}/g, '\n\n')   // cap blank-line runs at one blank line
    .replace(/[ \t]+/g, ' ')      // collapse horizontal whitespace
    .trim();
  return trimmed.slice(0, CONTACT_MESSAGE_MAX_LENGTH);
}

/**
 * Render a sanitised message as HTML, escaping every character and turning
 * newlines into <br> so the email layout matches what the user typed.
 *
 * Inputs: an already-sanitised plain-text message.
 * Output: an HTML fragment that is safe to embed in an email template.
 */
export function messageToHtml(sanitisedMessage: string): string {
  return escapeHtml(sanitisedMessage).replace(/\n/g, '<br>');
}
