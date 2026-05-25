/**
 * Israeli mobile phone number utilities for wallet auth.
 * Normalizes user-supplied phone numbers to the canonical local form
 * (05XXXXXXXX) and provides a SHA-256 hash helper for logging.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.1
 */
import { createHash } from 'crypto';

const ISRAELI_MOBILE = /^05\d{8}$/;

/**
 * Normalize any Israeli mobile representation to local 05XXXXXXXX.
 * Strips +972 / 972 / 00972 prefixes, non-digit characters, and
 * prepends a leading 0 if the user typed a 9-digit local number
 * without it. Throws Error('invalid_phone') for anything that is
 * not a valid Israeli mobile after normalization.
 *
 * @param raw user-supplied phone string in any common format
 * @returns canonical 10-digit local string starting with 05
 */
export function normalizeIsraeliPhone(raw: string): string {
  if (!raw) throw new Error('invalid_phone');
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00972')) digits = digits.slice(5);
  else if (digits.startsWith('972')) digits = digits.slice(3);
  if (digits.length === 9 && digits.startsWith('5')) digits = '0' + digits;
  if (!ISRAELI_MOBILE.test(digits)) throw new Error('invalid_phone');
  return digits;
}

/**
 * SHA-256 hex hash of a phone number, for safe logging.
 * Raw phones must never appear in logs; log the hash so we can
 * correlate requests without leaking PII.
 *
 * @param phone canonical phone (call after normalizeIsraeliPhone)
 * @returns 64-character lowercase hex digest
 */
export function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex');
}
