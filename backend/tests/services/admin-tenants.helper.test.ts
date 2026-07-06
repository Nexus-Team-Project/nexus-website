/**
 * Unit test for toAdminTenantRow - the pure mapper from a tenant doc + pending
 * count to the admin trusted-tenants row. No DB.
 */
import { describe, it, expect } from 'vitest';
import { toAdminTenantRow } from '../../src/services/admin-tenants.service';

describe('toAdminTenantRow', () => {
  it('maps a tenant doc + pending count; defaults autoApproveOffers to false', () => {
    expect(toAdminTenantRow({ tenantId: 't1', organizationName: 'Acme', status: 'active' }, 3))
      .toEqual({ tenantId: 't1', organizationName: 'Acme', status: 'active', autoApproveOffers: false, pendingOfferCount: 3 });
  });
  it('includes logo/brandColor/flag when present', () => {
    expect(toAdminTenantRow({ tenantId: 't2', organizationName: 'B', status: 'active', logoUrl: 'u', brandColor: '#111111', autoApproveOffers: true }, 0))
      .toEqual({ tenantId: 't2', organizationName: 'B', status: 'active', logoUrl: 'u', brandColor: '#111111', autoApproveOffers: true, pendingOfferCount: 0 });
  });
});
