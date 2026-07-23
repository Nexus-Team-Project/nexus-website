/**
 * Public (unauthenticated) tenant-info lookup. Returns a tenant's public
 * name/logo for any real, non-suspended/archived tenant - it does NOT
 * require that tenant to have activated its OWN Benefits Catalog (2026-07-19
 * fix: an ecosystem-offer creator/supplier tenant that never turned on its
 * own member-facing catalog was otherwise invisible, so the wallet's "Visit
 * tenant" link from an offer page 404'd for those creators even though their
 * name/logo/brand color are already shown on the offer page via creator
 * attribution - this lookup just makes the dedicated page consistent with
 * that). Suspended/archived tenants stay hidden. Exposes no membership,
 * pricing, or secret fields.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import type { TenantCoverImage } from '../../models/domain/tenant.models';
import { getTenantRatingSummary, type TenantRatingSummary } from '../wallet/tenant-rating.service';
import { buildSocialUrl } from '../../schemas/socialHandle.schemas';

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
  /**
   * The owner-authored website URL from the onboarding wizard
   * (tenantProfiles.website). Absent when never filled. Powers the wallet
   * tenant page share row.
   */
  website?: string;
  /**
   * Public profile URLs, built from the tenant's stored HANDLE (never a
   * user-supplied domain) + our own hardcoded per-platform domain. Absent
   * when the tenant never set that handle. Powers the wallet tenant page
   * share row alongside `website`.
   */
  instagramUrl?: string;
  facebookUrl?: string;
  twitterUrl?: string;
  /**
   * Aggregate member rating for this tenant (average/count/star
   * distribution). Absent when nobody has rated this tenant yet - the wallet
   * must render a "no ratings yet" state rather than a fabricated 0.0.
   */
  rating?: TenantRatingSummary;
}

/** Tenant statuses hidden from the public lookup - everything else is visible. */
const HIDDEN_TENANT_STATUSES = new Set(['suspended', 'archived']);

/**
 * Resolve the public-facing name/logo/description for a tenant.
 *
 * @param db        Mongo handle
 * @param tenantId  domain tenantId
 * @returns public tenant info, or null when the tenant does not exist or is
 *          suspended/archived.
 */
export async function getPublicTenantInfo(
  db: Db,
  tenantId: string,
): Promise<PublicTenantInfo | null> {
  const tenant = await db
    .collection(DOMAIN_COLLECTIONS.domainTenants)
    .findOne({ tenantId });
  if (!tenant) return null;
  if (HIDDEN_TENANT_STATUSES.has(tenant.status as string)) return null;

  const [profile, ratingSummary] = await Promise.all([
    db
      .collection(DOMAIN_COLLECTIONS.tenantProfiles)
      .findOne({ tenantId }, { projection: { businessDescription: 1, website: 1 } }),
    getTenantRatingSummary(db, tenantId),
  ]);
  const businessDescription =
    typeof profile?.businessDescription === 'string' && profile.businessDescription.trim() !== ''
      ? profile.businessDescription
      : undefined;
  const website =
    typeof profile?.website === 'string' && profile.website.trim() !== '' ? profile.website : undefined;

  const coverImages = (tenant.coverImages as TenantCoverImage[] | undefined) ?? [];

  const instagramHandle = tenant.instagramHandle as string | undefined;
  const facebookHandle = tenant.facebookHandle as string | undefined;
  const twitterHandle = tenant.twitterHandle as string | undefined;

  return {
    tenantId,
    organizationName: tenant.organizationName as string,
    logoUrl: (tenant.logoUrl as string | undefined) ?? undefined,
    brandColor: (tenant.brandColor as string | undefined) ?? undefined,
    ...(coverImages.length > 0 ? { coverImages } : {}),
    ...(businessDescription !== undefined ? { businessDescription } : {}),
    ...(website !== undefined ? { website } : {}),
    ...(instagramHandle ? { instagramUrl: buildSocialUrl('instagram', instagramHandle) } : {}),
    ...(facebookHandle ? { facebookUrl: buildSocialUrl('facebook', facebookHandle) } : {}),
    ...(twitterHandle ? { twitterUrl: buildSocialUrl('twitter', twitterHandle) } : {}),
    ...(ratingSummary !== null ? { rating: ratingSummary } : {}),
  };
}
