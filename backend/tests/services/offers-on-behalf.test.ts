/**
 * Unit test for resolveCreateAttribution (M7): who a new offer is stamped as +
 * its visibility + forceActive, for the caller vs the admin-on-behalf case.
 */
import { describe, it, expect } from 'vitest';
import { resolveCreateAttribution } from '../../src/services/supply-on-behalf.helper';

const admin = { tenantId: 'nexus_platform', identityId: 'admin_id', isPlatformAdmin: true };
const tenant = { tenantId: 't_self', identityId: 'self_id', isPlatformAdmin: false };

describe('resolveCreateAttribution', () => {
  it('no onBehalf -> uses the caller (admin forced ecosystem, tenant keeps choice)', () => {
    expect(resolveCreateAttribution(admin, undefined, null, 'tenant_only')).toEqual({
      createdByTenantId: 'nexus_platform', createdByIdentityId: 'admin_id', visibility: 'ecosystem', forceActive: false,
    });
    expect(resolveCreateAttribution(tenant, undefined, null, 'tenant_only')).toEqual({
      createdByTenantId: 't_self', createdByIdentityId: 'self_id', visibility: 'tenant_only', forceActive: false,
    });
  });
  it('admin on-behalf -> stamps target tenant + owner, honors chosen visibility, forceActive', () => {
    const target = { tenantId: 't_x', createdByIdentityId: 'owner_x' };
    expect(resolveCreateAttribution(admin, 't_x', target, 'ecosystem')).toEqual({
      createdByTenantId: 't_x', createdByIdentityId: 'owner_x', visibility: 'ecosystem', forceActive: true,
    });
    expect(resolveCreateAttribution(admin, 't_x', target, 'tenant_only')).toEqual({
      createdByTenantId: 't_x', createdByIdentityId: 'owner_x', visibility: 'tenant_only', forceActive: true,
    });
  });
});
