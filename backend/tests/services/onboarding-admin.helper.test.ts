/**
 * Unit test for isNoTenantPlatformAdmin - decides whether /api/me should return
 * the non-onboarding 'platform_admin' mode. Pure, no DB.
 */
import { describe, it, expect } from 'vitest';
import { isNoTenantPlatformAdmin } from '../../src/services/onboarding-admin.helper';

describe('isNoTenantPlatformAdmin', () => {
  it('is true only for a platform admin with no tenant and no member record', () => {
    expect(isNoTenantPlatformAdmin(true, { isTenant: false, isMember: false })).toBe(true);
  });
  it('is false when the admin is a tenant member', () => {
    expect(isNoTenantPlatformAdmin(true, { isTenant: true, isMember: false })).toBe(false);
    expect(isNoTenantPlatformAdmin(true, { isTenant: false, isMember: true })).toBe(false);
  });
  it('is false for a non-admin no-tenant user', () => {
    expect(isNoTenantPlatformAdmin(false, { isTenant: false, isMember: false })).toBe(false);
  });
});
