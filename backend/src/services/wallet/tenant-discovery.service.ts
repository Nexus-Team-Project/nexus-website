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
    .collection<{ tenantId: string; organizationName?: string; logoUrl?: string }>(
      DOMAIN_COLLECTIONS.domainTenants,
    )
    .find(tenantFilter)
    .project<{ tenantId: string; organizationName?: string; logoUrl?: string }>({
      tenantId: 1,
      organizationName: 1,
      logoUrl: 1,
    })
    .sort({ organizationName: 1 })
    .limit(cap)
    .toArray();

  return docs
    // Drop anonymous / unnamed workspaces - they would render as
    // 'Tenant' with no way to disambiguate. Once tenants must always
    // have an organizationName at create-time this filter is a no-op.
    .filter((d) => (d.organizationName ?? '').trim().length > 0)
    .map((d) => ({
      tenantId: d.tenantId,
      tenantName: d.organizationName!.trim(),
      ...(d.logoUrl ? { logoUrl: d.logoUrl } : {}),
    }));
}
