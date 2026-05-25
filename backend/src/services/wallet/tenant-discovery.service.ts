/**
 * Tenant discovery for wallet join-request flow. A tenant is
 * discoverable when it has an active `tenantServiceActivations` row
 * for `serviceKey='benefits_catalog'`. No new admin flag - the
 * activation IS the implicit "we want members" signal (spec section 7).
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
 * Returns tenants that have activated Benefits Catalog. Optional
 * case-insensitive text filter on displayName. Excludes tenants the
 * caller is already a member of (no point joining what you already have).
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

  // Active benefits_catalog activations -> tenant ids.
  const activations = await db
    .collection<{ tenantId: string; serviceKey: string; status: string }>(
      DOMAIN_COLLECTIONS.tenantServiceActivations,
    )
    .find({ serviceKey: 'benefits_catalog', status: 'active' })
    .project<{ tenantId: string }>({ tenantId: 1 })
    .toArray();

  const discoverableIds = activations
    .map((a) => a.tenantId)
    .filter((id) => !ownTenantIds.includes(id));
  if (discoverableIds.length === 0) return [];

  const tenantFilter: Record<string, unknown> = { tenantId: { $in: discoverableIds } };
  if (args.query?.trim()) {
    const escaped = args.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    tenantFilter.displayName = { $regex: escaped, $options: 'i' };
  }

  const docs = await db
    .collection<{ tenantId: string; displayName: string; logoUrl?: string }>(
      DOMAIN_COLLECTIONS.domainTenants,
    )
    .find(tenantFilter)
    .project<{ tenantId: string; displayName: string; logoUrl?: string }>({
      tenantId: 1,
      displayName: 1,
      logoUrl: 1,
    })
    .limit(cap)
    .toArray();

  return docs.map((d) => ({
    tenantId: d.tenantId,
    tenantName: d.displayName,
    ...(d.logoUrl ? { logoUrl: d.logoUrl } : {}),
  }));
}
