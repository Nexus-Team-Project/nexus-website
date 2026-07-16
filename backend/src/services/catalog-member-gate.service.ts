/**
 * Member-facing benefits catalog access gate (decision 7, 2026-07-15).
 * A regular member may browse a tenant's catalog when they hold an ACTIVE
 * tenantMembers row for that tenant AND the tenant's benefits_catalog service
 * activation is ACTIVE. The member's services array is deliberately NOT
 * consulted: join-path members carry services: [] and must pass. Callers with
 * the catalog.view permission (admins/managers) skip the membership check but
 * still require an active catalog.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../models/domain/collections';

export type MemberCatalogAccess = 'allowed' | 'catalog_inactive' | 'forbidden';

/**
 * Resolve whether the caller may browse the member catalog of `tenantId`.
 * @param db Mongo handle.
 * @param args.tenantId catalog scope (path param, not auth context).
 * @param args.nexusIdentityId the CALLER's identity (derived server-side).
 * @param args.hasCatalogViewPermission true for admins/managers (catalog.view).
 * @returns 'allowed' | 'catalog_inactive' (service not active for the tenant)
 *          | 'forbidden' (caller has no active membership).
 */
export async function resolveMemberCatalogAccess(
  db: Db,
  args: { tenantId: string; nexusIdentityId: string; hasCatalogViewPermission: boolean },
): Promise<MemberCatalogAccess> {
  const serviceActive = await db
    .collection(DOMAIN_COLLECTIONS.tenantServiceActivations)
    .findOne(
      { tenantId: args.tenantId, serviceKey: 'benefits_catalog', status: 'active' },
      { projection: { _id: 1 } },
    );
  if (!serviceActive) return 'catalog_inactive';
  if (args.hasCatalogViewPermission) return 'allowed';

  const activeMembership = await db
    .collection(DOMAIN_COLLECTIONS.tenantMembers)
    .findOne(
      { tenantId: args.tenantId, nexusIdentityId: args.nexusIdentityId, status: 'active' },
      { projection: { _id: 1 } },
    );
  return activeMembership ? 'allowed' : 'forbidden';
}
