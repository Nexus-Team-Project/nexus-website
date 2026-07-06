/**
 * Maps a creating-tenant document (or its absence) to the uploader-identity fields
 * exposed on a CatalogItem. A missing tenant (e.g. the NEXUS platform sentinel, which
 * has no domainTenants doc) falls back to the "NEXUS" name with no logo. Pure: no I/O.
 */
import type { LogoCrop } from '../models/domain/tenant.models';

export interface UploaderTenantDoc {
  organizationName?: string;
  logoUrl?: string;
  brandColor?: string;
  logoCrop?: LogoCrop | null;
}

export interface UploaderFields {
  createdByTenantName?: string;
  createdByTenantLogoUrl?: string;
  createdByTenantBrandColor?: string;
  /** Crop of the uploader's logo (normalized fractions), applied at display time. */
  createdByTenantLogoCrop?: LogoCrop | null;
}

export function uploaderFieldsFromTenant(tenant: UploaderTenantDoc | undefined | null): UploaderFields {
  if (!tenant) return { createdByTenantName: 'NEXUS' };
  return {
    createdByTenantName: tenant.organizationName ?? 'NEXUS',
    ...(tenant.logoUrl ? { createdByTenantLogoUrl: tenant.logoUrl } : {}),
    ...(tenant.brandColor ? { createdByTenantBrandColor: tenant.brandColor } : {}),
    ...(tenant.logoCrop ? { createdByTenantLogoCrop: tenant.logoCrop } : {}),
  };
}
