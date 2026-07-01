/**
 * Unit test for isEcosystemBusinessSetupGateEnforced - the ecosystem business-setup
 * gate is enforced only in production; relaxed elsewhere for dev/test. Pure, no DB.
 */
import { describe, it, expect } from 'vitest';
import { isEcosystemBusinessSetupGateEnforced } from '../../src/services/supply-ecosystem-gate.helper';

describe('isEcosystemBusinessSetupGateEnforced', () => {
  it('is enforced only in production', () => {
    expect(isEcosystemBusinessSetupGateEnforced('production')).toBe(true);
    expect(isEcosystemBusinessSetupGateEnforced('development')).toBe(false);
    expect(isEcosystemBusinessSetupGateEnforced('test')).toBe(false);
    expect(isEcosystemBusinessSetupGateEnforced(undefined)).toBe(false);
  });
});
