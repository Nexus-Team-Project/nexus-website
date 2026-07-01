/**
 * Unit test for uploaderFieldsFromTenant - maps a creating-tenant doc (or absence)
 * to the uploader-identity fields on a CatalogItem. Pure, no DB.
 */
import { describe, it, expect } from 'vitest';
import { uploaderFieldsFromTenant } from '../../src/services/catalog-uploader.helper';

describe('uploaderFieldsFromTenant', () => {
  it('maps a tenant doc to name/logo/brandColor/logoCrop', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
    expect(uploaderFieldsFromTenant({ organizationName: 'Acme', logoUrl: 'http://x/l.png', brandColor: '#112233', logoCrop: crop }))
      .toEqual({ createdByTenantName: 'Acme', createdByTenantLogoUrl: 'http://x/l.png', createdByTenantBrandColor: '#112233', createdByTenantLogoCrop: crop });
  });
  it('falls back to NEXUS when the tenant is missing (platform-created offers)', () => {
    expect(uploaderFieldsFromTenant(undefined)).toEqual({ createdByTenantName: 'NEXUS' });
  });
  it('omits absent optional fields', () => {
    expect(uploaderFieldsFromTenant({ organizationName: 'Acme' })).toEqual({ createdByTenantName: 'Acme' });
  });
});
