/**
 * Pure helpers for the voucher unit-level dating model (voucher-validity-dating).
 *
 * The validity TYPE is a parent default plus an optional per-variant override;
 * the validity VALUE lives on each inventory unit. These helpers resolve a unit's
 * effective type and decide whether a unit is "complete" for that type. Kept pure
 * (no DB, no I/O) so they can be reused by the offer route, the inventory route,
 * the backfill, and unit tests.
 */
import type { ValidityType } from '../models/domain/supply-variants.models';

/** The unit validity fields the completeness check reads (subset of VoucherCode). */
export interface UnitValidityFields {
  validityValue?: number | null;
  validityUnit?: 'days' | 'months' | 'years' | null;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
}

/**
 * Resolves a unit's effective validity type from the parent default and the
 * variant override.
 *
 * Input:  parentDefault - the offer's defaultValidityType (may be null/absent).
 *         override       - the variant's validityTypeOverride (null = inherit).
 * Output: the effective ValidityType, or null when neither is set (non-voucher
 *         or an unmigrated offer).
 */
export function effectiveValidityType(
  parentDefault: ValidityType | null | undefined,
  override: ValidityType | null | undefined,
): ValidityType | null {
  return override ?? parentDefault ?? null;
}

/**
 * Decides whether a single inventory unit carries the validity its effective
 * type requires (the per-unit completeness gate - there is no "never expires").
 *
 *   - 'limit'      -> needs validityValue (positive int) AND validityUnit.
 *   - 'from_until' -> needs validFrom AND validUntil, with validUntil on or
 *                     after validFrom.
 *
 * Input:  unit          - the unit's validity fields.
 *         effectiveType - the unit's effective validity type.
 * Output: true when the unit is complete for that type.
 */
export function isUnitComplete(
  unit: UnitValidityFields,
  effectiveType: ValidityType,
): boolean {
  if (effectiveType === 'limit') {
    return (
      unit.validityValue != null &&
      Number.isInteger(unit.validityValue) &&
      unit.validityValue > 0 &&
      unit.validityUnit != null
    );
  }
  // from_until: an authored absolute window with a non-inverted range.
  if (unit.validFrom == null || unit.validUntil == null) return false;
  const from = new Date(unit.validFrom).getTime();
  const until = new Date(unit.validUntil).getTime();
  if (Number.isNaN(from) || Number.isNaN(until)) return false;
  return until >= from;
}
