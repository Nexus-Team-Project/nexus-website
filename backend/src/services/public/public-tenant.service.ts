/**
 * Public (unauthenticated) tenant-info lookup. Returns a tenant's public
 * name/logo ONLY when that tenant has an active benefits_catalog service
 * activation, so half-set-up or suspended tenants are not exposed. Go-live
 * status is intentionally disregarded (sandbox-but-catalog-active tenants
 * are publicly viewable). Exposes no membership, pricing, or secret fields.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';

export interface PublicTenantInfo {
  tenantId: string;
  organizationName: string;
  logoUrl?: string;
  /** Org brand color ("#rrggbb"); drives the wallet first-login accent. */
  brandColor?: string;
}

/**
 * Resolve the public-facing name/logo for a tenant.
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

  return {
    tenantId,
    organizationName: tenant.organizationName as string,
    logoUrl: (tenant.logoUrl as string | undefined) ?? undefined,
    brandColor: (tenant.brandColor as string | undefined) ?? undefined,
  };
}
