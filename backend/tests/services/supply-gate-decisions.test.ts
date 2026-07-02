/**
 * Unit tests for the M9 supply gate decisions: who may create / adopt an offer.
 */
import { describe, it, expect } from 'vitest';
import { canTenantCreateOffer, canTenantAdoptOffer } from '../../src/services/business-setup-approval.helper';

describe('canTenantCreateOffer', () => {
  it('admins always can; non-admins only when approved', () => {
    expect(canTenantCreateOffer(true, false)).toBe(true);   // admin
    expect(canTenantCreateOffer(false, true)).toBe(true);    // approved tenant
    expect(canTenantCreateOffer(false, false)).toBe(false);  // not approved
  });
});

describe('canTenantAdoptOffer', () => {
  it('own offer or admin always; else only when approved', () => {
    expect(canTenantAdoptOffer(true, false, false)).toBe(true);   // own offer
    expect(canTenantAdoptOffer(false, true, false)).toBe(true);   // admin
    expect(canTenantAdoptOffer(false, false, true)).toBe(true);   // approved
    expect(canTenantAdoptOffer(false, false, false)).toBe(false); // none
  });
});
