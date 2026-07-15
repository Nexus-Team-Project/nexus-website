/**
 * Unit tests for the M9 supply gate decisions: who may create an offer.
 * (The adopt gate was removed 2026-07-15 - adoption needs no business-setup approval.)
 */
import { describe, it, expect } from 'vitest';
import { canTenantCreateOffer } from '../../src/services/business-setup-approval.helper';

describe('canTenantCreateOffer', () => {
  it('admins always can; non-admins only when approved', () => {
    expect(canTenantCreateOffer(true, false)).toBe(true);   // admin
    expect(canTenantCreateOffer(false, true)).toBe(true);    // approved tenant
    expect(canTenantCreateOffer(false, false)).toBe(false);  // not approved
  });
});
