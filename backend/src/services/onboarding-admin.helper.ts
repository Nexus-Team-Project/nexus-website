/**
 * Decides whether /api/me should report the non-onboarding 'platform_admin' state:
 * the caller is a NEXUS platform admin (email in NEXUS_ADMIN_EMAILS) AND holds no
 * tenant membership and no member record, so there is nothing to onboard.
 * Pure: no I/O.
 */
export function isNoTenantPlatformAdmin(
  isPlatformAdmin: boolean,
  context: { isTenant: boolean; isMember: boolean },
): boolean {
  return isPlatformAdmin === true && context.isTenant === false && context.isMember === false;
}
