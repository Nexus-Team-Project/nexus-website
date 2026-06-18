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
  VOUCHER_VALIDITY_MAX,
  type OfferVoucherValidityUnit,
} from '../models/domain/supply.models';

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
