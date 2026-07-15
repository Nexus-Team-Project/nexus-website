/**
 * Voucher-specific validation helpers for the supply/offers layer.
 *
 * A voucher's expiry is a redemption window measured from the moment a customer
 * PURCHASES the voucher (not an absolute calendar date), expressed as an
 * amount + unit pair (e.g. 2 + 'years'). This module owns the cross-field
 * validation for that pair so it can be unit-tested in isolation and reused by
 * the create + update route handlers.
 *
 * Extracted from offers.routes.ts to keep that file within the 350-line limit
 * and to give the security-relevant validation a pure, testable surface.
 */
import {
  VOUCHER_PAYMENTS_DEFAULT,
  VOUCHER_PAYMENTS_MAX,
  VOUCHER_PAYMENTS_MIN,
  VOUCHER_VALIDITY_MAX,
  type OfferVoucherValidityUnit,
} from '../models/domain/supply.models';

/**
 * Resolves the stored `maxPayments` value for a create/update write.
 * Voucher: the provided value clamped into [VOUCHER_PAYMENTS_MIN, VOUCHER_PAYMENTS_MAX]
 * (Zod already bounds route input; the clamp guards non-route callers such as
 * the backfill), defaulting to VOUCHER_PAYMENTS_DEFAULT when absent.
 * Non-voucher: always null - the field never carries a value on other types.
 */
export function resolveVoucherMaxPayments(
  isVoucher: boolean,
  value: number | undefined,
): number | null {
  if (!isVoucher) return null;
  const v = value ?? VOUCHER_PAYMENTS_DEFAULT;
  return Math.min(Math.max(Math.round(v), VOUCHER_PAYMENTS_MIN), VOUCHER_PAYMENTS_MAX);
}

/** Result of a voucher validity check. */
export type VoucherValidityResult =
  | { ok: true }
  | { ok: false; error: string; errorHe: string };

/**
 * Validates a voucher validity (amount, unit) pair after Zod coercion.
 *
 * Rules:
 *   - both null/absent -> ok (the voucher never expires).
 *   - both present     -> the unit must be valid (Zod-checked upstream) and the
 *                         amount must not exceed the per-unit ceiling
 *                         (VOUCHER_VALIDITY_MAX).
 *   - only one present -> invalid (both-or-neither).
 *
 * Input:
 *   value - positive integer, null, or undefined (post-coercion).
 *   unit  - 'days' | 'months' | 'years', null, or undefined.
 * Output:
 *   { ok: true } when valid, or { ok: false, error, errorHe } with a bilingual
 *   message describing the failure. The caller maps this to a 400 response.
 */
export function assertVoucherValidity(
  value: number | null | undefined,
  unit: OfferVoucherValidityUnit | null | undefined,
): VoucherValidityResult {
  const hasValue = value !== null && value !== undefined;
  const hasUnit = unit !== null && unit !== undefined;

  if (!hasValue && !hasUnit) return { ok: true };

  if (hasValue !== hasUnit) {
    return {
      ok: false,
      error: 'Voucher validity requires both an amount and a unit',
      errorHe: 'תוקף השובר מחייב הזנת כמות ויחידת זמן יחד',
    };
  }

  // Both present from here. unit is a valid enum value (Zod-validated).
  const max = VOUCHER_VALIDITY_MAX[unit as OfferVoucherValidityUnit];
  if ((value as number) > max) {
    return {
      ok: false,
      error: `Voucher validity in ${unit} must not exceed ${max}`,
      errorHe: `תוקף השובר ב${unit} לא יכול לעלות על ${max}`,
    };
  }

  return { ok: true };
}

/** Strict "#rrggbb" hex color matcher (lower/upper case). */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * True when `v` is a valid "#rrggbb" hex color string. Used to validate the
 * optional voucher background color before it is ever used as a CSS value.
 *
 * Input:  any value.
 * Output: boolean — true only for a 6-digit hex string with a leading '#'.
 */
export function isValidHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_RE.test(v);
}

/**
 * Validates the mandatory voucher combine-with-promotions ("כפל מבצעים") choice.
 * A voucher MUST carry an explicit boolean; there is no default. Non-voucher
 * offers are not subject to this rule (the caller skips it).
 *
 * Input:  value - the supplied voucherStackable (boolean | null | undefined).
 * Output: { ok: true } when a boolean is present, else { ok: false, error,
 *         errorHe } describing the missing mandatory choice.
 */
export function assertVoucherStackable(
  value: boolean | null | undefined,
): VoucherValidityResult {
  if (typeof value === 'boolean') return { ok: true };
  return {
    ok: false,
    error: 'Voucher offers require a combine-with-promotions choice',
    errorHe: 'שובר מחייב בחירה אם ניתן לכפל מבצעים',
  };
}
