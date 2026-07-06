/**
 * Tests for the pure onboarding phone classifier: Israeli mobile -> israeli,
 * Israeli-prefixed junk -> invalid_israeli, anything else -> foreign.
 */
import { describe, it, expect } from 'vitest';
import { classifyOnboardingPhone } from '../../../src/services/onboarding/onboarding-phone.helper';

describe('classifyOnboardingPhone', () => {
  it('classifies a valid Israeli mobile (E164) as israeli + normalizes', () => {
    expect(classifyOnboardingPhone('+972508465858')).toEqual({ kind: 'israeli', normalized: '0508465858' });
  });

  it('classifies a valid Israeli mobile (local) as israeli', () => {
    expect(classifyOnboardingPhone('050-846-5858')).toEqual({ kind: 'israeli', normalized: '0508465858' });
  });

  it('accepts a leading zero kept after the dial code (+9720...)', () => {
    // react-international-phone keeps the local "0" when the user types
    // "0508465858" with the IL flag selected.
    expect(classifyOnboardingPhone('+9720508465858')).toEqual({ kind: 'israeli', normalized: '0508465858' });
  });

  it('classifies a +972 landline/short number as invalid_israeli', () => {
    expect(classifyOnboardingPhone('+97248465858')).toEqual({ kind: 'invalid_israeli' });
    expect(classifyOnboardingPhone('+97250846585')).toEqual({ kind: 'invalid_israeli' });
  });

  it('classifies an 05-prefixed wrong-length number as invalid_israeli', () => {
    expect(classifyOnboardingPhone('0508465')).toEqual({ kind: 'invalid_israeli' });
  });

  it('classifies a US number as foreign', () => {
    expect(classifyOnboardingPhone('+14155551234')).toEqual({ kind: 'foreign' });
  });
});
