/**
 * Pure attribution decision for offer create (M7 admin upload-on-behalf). No DB.
 *
 * Returns who a new offer is stamped as, its effective visibility, and whether to
 * force-active status:
 * - No onBehalfOfTenantId: use the caller. Platform admins are still forced to
 *   'ecosystem' (their own platform offers); tenants keep their chosen visibility.
 * - Admin on-behalf (onBehalfOfTenantId + a resolved target tenant): stamp the
 *   TARGET tenant + its owner identity, honor the admin's chosen visibility, and
 *   force-active (the admin implicitly approves).
 *
 * The route validates admin-only + target existence BEFORE calling this.
 */
export function resolveCreateAttribution(
  caller: { tenantId: string; identityId: string; isPlatformAdmin: boolean },
  onBehalfOfTenantId: string | undefined,
  targetTenant: { tenantId: string; createdByIdentityId: string } | null,
  chosenVisibility: 'ecosystem' | 'tenant_only',
): { createdByTenantId: string; createdByIdentityId: string; visibility: 'ecosystem' | 'tenant_only'; forceActive: boolean } {
  if (onBehalfOfTenantId && targetTenant) {
    return {
      createdByTenantId: targetTenant.tenantId,
      createdByIdentityId: targetTenant.createdByIdentityId,
      visibility: chosenVisibility,
      forceActive: true,
    };
  }
  return {
    createdByTenantId: caller.tenantId,
    createdByIdentityId: caller.identityId,
    visibility: caller.isPlatformAdmin ? 'ecosystem' : chosenVisibility,
    forceActive: false,
  };
}
