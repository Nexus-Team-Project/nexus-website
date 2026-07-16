/**
 * Resolves a tenant's logo URL for tenant-sent emails (invites, outreach,
 * removals). Best-effort: any failure returns null so an email never fails
 * because of a logo lookup.
 */
import { getMongoDb } from '../../config/mongo';
import { getTenantDomainCollections } from '../../models/domain';

/**
 * Fetch the tenant's logo URL.
 * Input: tenant id (may be undefined when the caller has none).
 * Output: the Cloudinary logo URL, or null when unset/unknown/failed.
 */
export async function fetchTenantEmailLogoUrl(tenantId: string | undefined): Promise<string | null> {
  if (!tenantId) return null;
  try {
    const db = await getMongoDb();
    const tenant = await getTenantDomainCollections(db).domainTenants.findOne(
      { tenantId },
      { projection: { logoUrl: 1 } },
    );
    return tenant?.logoUrl ?? null;
  } catch {
    return null;
  }
}
