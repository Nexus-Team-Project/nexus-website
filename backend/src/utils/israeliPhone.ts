/**
 * Israeli phone number normalization helper.
 * Accepts inputs with or without the +972 country code and with common
 * formatting characters (spaces, dashes, parentheses) and normalizes them
 * to the canonical local 10-digit form: 05XXXXXXXX.
 *
 * Examples of accepted input -> normalized output:
 *   "0508465858"      -> "0508465858"
 *   "+972508465858"   -> "0508465858"
 *   "972-50-846-5858" -> "0508465858"
 *   "050 846 5858"    -> "0508465858"
 *
 * Any other shape (wrong length, not starting with 05 after normalization,
 * non-mobile prefix) returns null.
 */

/**
 * Normalizes a raw phone string into the canonical Israeli mobile format.
 * Input: arbitrary user-supplied phone string (may be undefined or blank).
 * Output: canonical "05XXXXXXXX" string when valid, otherwise null.
 */
export function normalizeIsraeliPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Strip everything except digits and a leading plus sign.
  const compact = trimmed.replace(/[^\d+]/g, '');

  // Strip leading +972 or 972 country code and replace with the local "0".
  let local: string;
  if (compact.startsWith('+972')) {
    local = '0' + compact.slice(4);
  } else if (compact.startsWith('972')) {
    local = '0' + compact.slice(3);
  } else {
    local = compact;
  }

  // Must be exactly 10 digits starting with "05" (Israeli mobile prefix).
  if (!/^05\d{8}$/.test(local)) return null;
  return local;
}

/**
 * Convenience boolean wrapper around normalizeIsraeliPhone.
 * Input: raw phone string.
 * Output: true when normalization succeeds.
 */
export function isIsraeliPhone(raw: string | undefined | null): boolean {
  return normalizeIsraeliPhone(raw) !== null;
}
