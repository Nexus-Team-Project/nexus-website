/**
 * Public (unauthenticated) tenant-info lookup. Returns a tenant's public
 * name/logo ONLY when that tenant has an active benefits_catalog service
 * activation, so half-set-up or suspended tenants are not exposed. Go-live
 * status is intentionally disregarded (sandbox-but-catalog-active tenants
 * are publicly viewable). Exposes no membership, pricing, or secret fields.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import type { TenantCoverImage } from '../../models/domain/tenant.models';

export interface PublicTenantInfo {
  tenantId: string;
  organizationName: string;
  logoUrl?: string;
  /** Org brand color ("#rrggbb"); drives the wallet first-login accent. */
  brandColor?: string;
  /**
   * Ordered cover-image gallery (max 5): pristine Cloudinary URL + display
   * crop per entry. Powers the wallet offer-page hero (>1 = slideshow).
   * Always OUR re-hosted Cloudinary URLs; empty when the tenant set none.
   */
  coverImages?: TenantCoverImage[];
  /**
   * The owner-authored business description from the onboarding wizard
   * (tenantProfiles.businessDescription, plain text <=2000 chars). Absent when
   * never filled. Powers the wallet tenant page + offer-page tenant card.
   */
  businessDescription?: string;
}

/**
 * Resolve the public-facing name/logo/description for a tenant.
 *
 * @param db        Mongo handle
 * @param tenantId  domain tenantId
 * @returns public tenant info, or null when the tenant does not exist or
 *          has no active benefits_catalog activation.
 */
export async function getPublicTenantInfo(
  db: Db,
  tenantId: string,
): Promise<PublicTenantInfo | null> {
  const activation = await db
    .collection(DOMAIN_COLLECTIONS.tenantServiceActivations)
    .findOne({ tenantId, serviceKey: 'benefits_catalog', status: 'active' });
  if (!activation) return null;

  const tenant = await db
    .collection(DOMAIN_COLLECTIONS.domainTenants)
    .findOne({ tenantId });
  if (!tenant) return null;

  const profile = await db
    .collection(DOMAIN_COLLECTIONS.tenantProfiles)
    .findOne({ tenantId }, { projection: { businessDescription: 1 } });
  const businessDescription =
    typeof profile?.businessDescription === 'string' && profile.businessDescription.trim() !== ''
      ? profile.businessDescription
      : undefined;

  const coverImages = (tenant.coverImages as TenantCoverImage[] | undefined) ?? [];

  return {
    tenantId,
    organizationName: tenant.organizationName as string,
    logoUrl: (tenant.logoUrl as string | undefined) ?? undefined,
    brandColor: (tenant.brandColor as string | undefined) ?? undefined,
    ...(coverImages.length > 0 ? { coverImages } : {}),
    ...(businessDescription !== undefined ? { businessDescription } : {}),
  };
}
