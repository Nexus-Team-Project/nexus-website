/**
 * Picks the tenant membership that should define a user's dashboard context.
 *
 * Privileged (non-'member') memberships win over plain member ones; ties break
 * oldest-first (the previous global behavior, preserved for single-tenant and
 * all-plain-member users). This matters for admin-assigned tenant OWNERS who
 * may also be a plain member of an OLDER tenant - without the preference they
 * would resolve into the wrong tenant on login.
 *
 * Used by both /api/me context resolution (onboarding.service) and the
 * offers/tenant routes context resolver (resolve-tenant-context).
 */
import type { Db } from 'mongodb';
import { getTenantDomainCollections, getIdentityDomainCollections } from '../models/domain';
import type { TenantMemberDomainDocument } from '../models/domain/tenant.models';

/**
 * Finds the preferred ACTIVE tenant membership for an identity.
 * Input: mongo db handle + nexusIdentityId.
 * Output: the membership doc to use for context, or null when none exists.
 */
export async function findPreferredTenantMembership(
  db: Db,
  nexusIdentityId: string,
): Promise<TenantMemberDomainDocument | null> {
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);

  const memberships = await tenantCollections.tenantMembers
    .find({ nexusIdentityId, status: 'active' })
    .sort({ createdAt: 1 })
    .toArray();
  if (memberships.length === 0) return null;
  if (memberships.length === 1) return memberships[0];

  // Only fetch roles when the user belongs to several tenants (rare), keeping
  // the common single-tenant path at one query.
  const privilegedRoles = await identityCollections.tenantUserRoles
    .find({
      nexusIdentityId,
      tenantId: { $in: memberships.map((m) => m.tenantId) },
      role: { $ne: 'member' },
    })
    .toArray();
  const privilegedTenantIds = new Set(privilegedRoles.map((r) => r.tenantId));
  return memberships.find((m) => privilegedTenantIds.has(m.tenantId)) ?? memberships[0];
}
