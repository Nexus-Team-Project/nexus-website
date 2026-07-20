/**
 * Maps a creating-tenant document (or its absence) to the uploader-identity fields
 * exposed on a CatalogItem. A missing tenant (e.g. the NEXUS platform sentinel, which
 * has no domainTenants doc) falls back to the "NEXUS" name with no logo. Pure: no I/O.
 */
import type { LogoCrop, TenantCoverImage } from '../models/domain/tenant.models';

export interface UploaderTenantDoc {
  organizationName?: string;
  logoUrl?: string;
  brandColor?: string;
  logoCrop?: LogoCrop | null;
  /** Ordered cover gallery; only the first entry is exposed on catalog items. */
  coverImages?: TenantCoverImage[];
}

export interface UploaderFields {
  createdByTenantName?: string;
  createdByTenantLogoUrl?: string;
  createdByTenantBrandColor?: string;
  /** Crop of the uploader's logo (normalized fractions), applied at display time. */
  createdByTenantLogoCrop?: LogoCrop | null;
  /**
   * The uploader's FIRST cover-gallery image (pristine URL + display crop).
   * Lets catalog cards render the creator's cover background without a
   * per-tenant public lookup; the full gallery stays on the public tenant
   * endpoint for surfaces that need the slideshow.
   */
  createdByTenantCoverImage?: TenantCoverImage;
}

export function uploaderFieldsFromTenant(tenant: UploaderTenantDoc | undefined | null): UploaderFields {
  if (!tenant) return { createdByTenantName: 'NEXUS' };
  const firstCover = tenant.coverImages?.[0];
  return {
    createdByTenantName: tenant.organizationName ?? 'NEXUS',
    ...(tenant.logoUrl ? { createdByTenantLogoUrl: tenant.logoUrl } : {}),
    ...(tenant.brandColor ? { createdByTenantBrandColor: tenant.brandColor } : {}),
    ...(tenant.logoCrop ? { createdByTenantLogoCrop: tenant.logoCrop } : {}),
    ...(firstCover ? { createdByTenantCoverImage: firstCover } : {}),
  };
}
