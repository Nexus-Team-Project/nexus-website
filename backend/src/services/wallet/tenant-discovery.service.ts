/**
 * Tenant discovery for wallet join-request flow. Returns every tenant
 * that exists in `domainTenants`, minus tenants the caller is already
 * a member of. Tenant logos are not in the onboarding schema yet, so
 * `logoUrl` is omitted and the wallet renders a placeholder for now.
 *
 * Originally this filtered by `tenantServiceActivations(benefits_catalog,
 * active)` as a soft "we want members" signal, but that gated discovery
 * on a flag tenants do not yet know to flip. Product call: show every
 * tenant; the join request still requires admin approval, so there is
 * no exposure risk in listing them.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 6
 */
import { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';

export interface DiscoverableTenant {
  tenantId: string;
  tenantName: string;
  logoUrl?: string;
  /** Org brand color ("#rrggbb"), when set; keeps tenant cards on-brand. */
  brandColor?: string;
  /**
   * Whether the tenant has an active Benefits Catalog. Tenants without it are
   * still listed (so members can see them coming) but cannot be joined yet —
   * the wallet renders them as a non-clickable "soon" row and the join-request
   * endpoint rejects them.
   */
  catalogActive: boolean;
}

/**
 * Returns every tenant in domainTenants (excluding the caller's own
 * memberships), optionally narrowed by a case-insensitive substring
 * match on organizationName. Sorted alphabetically for stable UI.
 */
export async function discoverTenants(
  db: Db,
  args: { nexusIdentityId: string; query?: string; limit?: number },
): Promise<DiscoverableTenant[]> {
  const cap = Math.min(Math.max(args.limit ?? 50, 1), 100);
  // Tenants already in user's membership set - exclude.
  const ownTenantIds = await db
    .collection<{ tenantId: string }>(DOMAIN_COLLECTIONS.tenantUserRoles)
    .distinct('tenantId', { nexusIdentityId: args.nexusIdentityId });

  const tenantFilter: Record<string, unknown> = {};
  if (ownTenantIds.length > 0) {
    tenantFilter.tenantId = { $nin: ownTenantIds };
  }
  if (args.query?.trim()) {
    const escaped = args.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    tenantFilter.organizationName = { $regex: escaped, $options: 'i' };
  }

  const docs = await db
    .collection<{ tenantId: string; organizationName?: string; logoUrl?: string; brandColor?: string }>(
      DOMAIN_COLLECTIONS.domainTenants,
    )
    .find(tenantFilter)
    .project<{ tenantId: string; organizationName?: string; logoUrl?: string; brandColor?: string }>({
      tenantId: 1,
      organizationName: 1,
      logoUrl: 1,
      brandColor: 1,
    })
    .sort({ organizationName: 1 })
    .limit(cap)
    .toArray();

  const named = docs
    // Drop anonymous / unnamed workspaces - they would render as
    // 'Tenant' with no way to disambiguate. Once tenants must always
    // have an organizationName at create-time this filter is a no-op.
    .filter((d) => (d.organizationName ?? '').trim().length > 0);

  // Which of these tenants have an ACTIVE Benefits Catalog? Only those can be
  // joined; the rest are listed as "soon". One query over the candidate set.
  const activeCatalogIds = await activeCatalogTenantIds(
    db,
    named.map((d) => d.tenantId),
  );

  return named.map((d) => ({
    tenantId: d.tenantId,
    tenantName: d.organizationName!.trim(),
    catalogActive: activeCatalogIds.has(d.tenantId),
    ...(d.logoUrl ? { logoUrl: d.logoUrl } : {}),
    ...(d.brandColor ? { brandColor: d.brandColor } : {}),
  }));
}

/**
 * Returns the subset of the given tenantIds that have an active Benefits
 * Catalog (a tenantServiceActivations row with serviceKey 'benefits_catalog'
 * and status 'active').
 * @param db Mongo handle.
 * @param tenantIds candidate tenantIds to check.
 * @returns a Set of the tenantIds whose catalog is active.
 */
export async function activeCatalogTenantIds(
  db: Db,
  tenantIds: string[],
): Promise<Set<string>> {
  if (tenantIds.length === 0) return new Set();
  const rows = await db
    .collection<{ tenantId: string }>(DOMAIN_COLLECTIONS.tenantServiceActivations)
    .find({ tenantId: { $in: tenantIds }, serviceKey: 'benefits_catalog', status: 'active' })
    .project<{ tenantId: string }>({ tenantId: 1 })
    .toArray();
  return new Set(rows.map((r) => r.tenantId));
}
