/**
 * Tests for the contacts-path Israeli phone normalizer (utils/israeliPhone).
 * All common shapes of the same mobile number must normalize to the one
 * canonical "05XXXXXXXX" form InforU receives; junk returns null.
 */
import { describe, it, expect } from 'vitest';
import { normalizeIsraeliPhone, isIsraeliPhone } from '../../src/utils/israeliPhone';

describe('normalizeIsraeliPhone (contacts path)', () => {
  it.each([
    ['0508465832', '0508465832'],
    ['+972508465832', '0508465832'],
    ['972508465832', '0508465832'],
    ['508465832', '0508465832'],
    ['+9720508465832', '0508465832'],
    ['050-846-5832', '0508465832'],
    ['+972 50 846 5832', '0508465832'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeIsraeliPhone(input)).toBe(expected);
  });

  it.each(['', '  ', '0512345', '0408123456', 'abcdefghij', '+12025550100', '12345'])(
    'returns null for %s',
    (input) => {
      expect(normalizeIsraeliPhone(input)).toBeNull();
    },
  );

  it('isIsraeliPhone mirrors the normalizer', () => {
    expect(isIsraeliPhone('508465832')).toBe(true);
    expect(isIsraeliPhone('12345')).toBe(false);
  });
});
