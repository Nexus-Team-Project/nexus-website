/**
 * Maps a creating-tenant document (or its absence) to the uploader-identity fields
 * exposed on a CatalogItem. A missing tenant (e.g. the NEXUS platform sentinel, which
 * has no domainTenants doc) falls back to the "NEXUS" name with no logo. Pure: no I/O.
 */
export interface UploaderTenantDoc {
  organizationName?: string;
  logoUrl?: string;
  brandColor?: string;
}

export interface UploaderFields {
  createdByTenantName?: string;
  createdByTenantLogoUrl?: string;
  createdByTenantBrandColor?: string;
}

export function uploaderFieldsFromTenant(tenant: UploaderTenantDoc | undefined | null): UploaderFields {
  if (!tenant) return { createdByTenantName: 'NEXUS' };
  return {
    createdByTenantName: tenant.organizationName ?? 'NEXUS',
    ...(tenant.logoUrl ? { createdByTenantLogoUrl: tenant.logoUrl } : {}),
    ...(tenant.brandColor ? { createdByTenantBrandColor: tenant.brandColor } : {}),
  };
}
