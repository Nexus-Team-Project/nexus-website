/**
 * Unit tests for voucher-validity.helper - the pure unit-level dating logic:
 * resolving a unit's effective validity type (parent default + variant override)
 * and the per-unit completeness gate for each type, including the lossless
 * type-flip behavior (a unit complete for one type may be incomplete for the
 * other, but its values are never read away). No DB.
 */
import { describe, it, expect } from 'vitest';
import {
  effectiveValidityType,
  isUnitComplete,
  type UnitValidityFields,
} from '../../src/services/voucher-validity.helper';

describe('effectiveValidityType', () => {
  it('uses the parent default when there is no override', () => {
    expect(effectiveValidityType('limit', null)).toBe('limit');
    expect(effectiveValidityType('from_until', undefined)).toBe('from_until');
  });

  it('lets the variant override win over the parent default', () => {
    expect(effectiveValidityType('limit', 'from_until')).toBe('from_until');
    expect(effectiveValidityType('from_until', 'limit')).toBe('limit');
  });

  it('returns null when neither is set', () => {
    expect(effectiveValidityType(null, null)).toBeNull();
    expect(effectiveValidityType(undefined, undefined)).toBeNull();
  });
});

describe('isUnitComplete - limit', () => {
  it('is complete with a positive integer amount and a unit', () => {
    expect(isUnitComplete({ validityValue: 5, validityUnit: 'years' }, 'limit')).toBe(true);
  });

  it('is incomplete without an amount or unit', () => {
    expect(isUnitComplete({ validityUnit: 'years' }, 'limit')).toBe(false);
    expect(isUnitComplete({ validityValue: 5 }, 'limit')).toBe(false);
    expect(isUnitComplete({}, 'limit')).toBe(false);
  });

  it('rejects non-positive or non-integer amounts', () => {
    expect(isUnitComplete({ validityValue: 0, validityUnit: 'days' }, 'limit')).toBe(false);
    expect(isUnitComplete({ validityValue: -1, validityUnit: 'days' }, 'limit')).toBe(false);
    expect(isUnitComplete({ validityValue: 1.5, validityUnit: 'days' }, 'limit')).toBe(false);
  });

  it('does not require a from/until window for a limit unit', () => {
    // limit units leave validFrom/validUntil empty until purchase.
    expect(isUnitComplete({ validityValue: 1, validityUnit: 'months', validFrom: null, validUntil: null }, 'limit')).toBe(true);
  });
});

describe('isUnitComplete - from_until', () => {
  it('is complete with a non-inverted window', () => {
    expect(isUnitComplete({ validFrom: '2026-01-01', validUntil: '2031-01-01' }, 'from_until')).toBe(true);
    expect(isUnitComplete({ validFrom: new Date('2026-01-01'), validUntil: new Date('2026-01-01') }, 'from_until')).toBe(true);
  });

  it('is incomplete when a bound is missing', () => {
    expect(isUnitComplete({ validFrom: '2026-01-01' }, 'from_until')).toBe(false);
    expect(isUnitComplete({ validUntil: '2031-01-01' }, 'from_until')).toBe(false);
    expect(isUnitComplete({}, 'from_until')).toBe(false);
  });

  it('rejects an inverted window', () => {
    expect(isUnitComplete({ validFrom: '2031-01-01', validUntil: '2026-01-01' }, 'from_until')).toBe(false);
  });

  it('rejects unparseable dates', () => {
    expect(isUnitComplete({ validFrom: 'not-a-date', validUntil: '2031-01-01' }, 'from_until')).toBe(false);
  });
});

describe('isUnitComplete - lossless flip', () => {
  it('a from_until-complete unit is incomplete as limit but keeps its values', () => {
    const unit: UnitValidityFields = { validFrom: '2026-01-01', validUntil: '2031-01-01' };
    expect(isUnitComplete(unit, 'from_until')).toBe(true);
    expect(isUnitComplete(unit, 'limit')).toBe(false);
    // The from/until values are untouched - the helper is pure / read-only.
    expect(unit.validFrom).toBe('2026-01-01');
  });

  it('a limit-complete unit is incomplete as from_until but keeps its values', () => {
    const unit: UnitValidityFields = { validityValue: 5, validityUnit: 'years' };
    expect(isUnitComplete(unit, 'limit')).toBe(true);
    expect(isUnitComplete(unit, 'from_until')).toBe(false);
    expect(unit.validityValue).toBe(5);
  });

  it('a unit carrying BOTH sets is complete for either type (flip back and forth)', () => {
    const unit: UnitValidityFields = {
      validityValue: 5, validityUnit: 'years',
      validFrom: '2026-01-01', validUntil: '2031-01-01',
    };
    expect(isUnitComplete(unit, 'limit')).toBe(true);
    expect(isUnitComplete(unit, 'from_until')).toBe(true);
  });
});
