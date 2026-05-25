/**
 * Computes the wallet-router portion of the /api/me response: which
 * tenants the user can enter as a member, whether they can open the
 * admin dashboard, and whether they are a platform admin.
 *
 * Drives the wallet RouterScreen UI - every login lands there and the
 * cards shown are scaled to what this user actually has.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 7
 */
import { Db } from 'mongodb';
import { env } from '../../config/env';
import { getIdentityDomainCollections } from '../../models/domain';
import { getTenantDomainCollections } from '../../models/domain/tenant.models';

/**
 * Tenant membership entry returned in /api/me. One row per
 * (identity, tenant) pair; if a user holds multiple roles in one
 * tenant we surface the highest-privilege role here.
 */
export interface MembershipSummary {
  tenantId: string;
  tenantName: string;
  role: string;
  isPrivilegedRole: boolean;
}

export interface MemberTenantSummary {
  tenantId: string;
  tenantName: string;
}

export interface WalletMeRouter {
  memberships: MembershipSummary[];
  isPlatformAdmin: boolean;
  canOpenDashboard: boolean;
  router: {
    showMemberTenants: MemberTenantSummary[];
    showAdminEntry: boolean;
    showEveryonesCatalog: boolean;
    showJoinRequest: boolean;
  };
}

const PRIVILEGED_NON_MEMBER = (role: string): boolean => role !== 'member';

function readPlatformAdminEmails(): string[] {
  return (env.NEXUS_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Build the wallet-router portion of the /api/me payload.
 *
 * @param db Mongo handle
 * @param args.nexusIdentityId domain identity id (NOT prisma user id)
 * @param args.email user's email (lowercased before comparison)
 */
export async function computeWalletMeRouter(
  db: Db,
  args: { nexusIdentityId: string; email: string },
): Promise<WalletMeRouter> {
  const platformAdmins = readPlatformAdminEmails();
  const isPlatformAdmin = platformAdmins.includes(args.email.toLowerCase());

  const { tenantUserRoles } = getIdentityDomainCollections(db);
  const { domainTenants } = getTenantDomainCollections(db);

  const allRoles = await tenantUserRoles
    .find({ nexusIdentityId: args.nexusIdentityId, tenantId: { $ne: null } })
    .toArray();
  const memberships: MembershipSummary[] = [];
  if (allRoles.length > 0) {
    const tenantIds = Array.from(new Set(allRoles.map((r) => r.tenantId).filter((t): t is string => !!t)));
    // domainTenants stores the human-readable string under
    // organizationName. Falls back to 'Tenant' (never the raw Mongo
    // ObjectId tenantId) so the wallet UI never surfaces a hex id.
    const tenantDocs = await domainTenants
      .find(
        { tenantId: { $in: tenantIds } },
        { projection: { tenantId: 1, organizationName: 1 } },
      )
      .toArray();
    const nameByTenant = new Map<string, string>();
    for (const t of tenantDocs) {
      const raw = (t as { organizationName?: string }).organizationName;
      nameByTenant.set(t.tenantId, raw && raw.trim() ? raw : 'Tenant');
    }
    // Collapse to one row per tenant - prefer the most privileged role
    // when a user holds multiple roles in the same tenant.
    const rolesByTenant = new Map<string, string[]>();
    for (const r of allRoles) {
      if (!r.tenantId) continue;
      const list = rolesByTenant.get(r.tenantId) ?? [];
      list.push(r.role);
      rolesByTenant.set(r.tenantId, list);
    }
    for (const [tenantId, roles] of rolesByTenant) {
      const role = pickPrimaryRole(roles);
      memberships.push({
        tenantId,
        // Never expose a raw Mongo tenantId - prefer a localized fallback.
        tenantName: nameByTenant.get(tenantId) ?? 'Tenant',
        role,
        isPrivilegedRole: PRIVILEGED_NON_MEMBER(role),
      });
    }
  }

  const memberTenants: MemberTenantSummary[] = memberships
    .filter((m) => !m.isPrivilegedRole)
    .map((m) => ({ tenantId: m.tenantId, tenantName: m.tenantName }));
  const canOpenDashboard = isPlatformAdmin || memberships.some((m) => m.isPrivilegedRole);

  return {
    memberships,
    isPlatformAdmin,
    canOpenDashboard,
    router: {
      showMemberTenants: memberTenants,
      showAdminEntry: canOpenDashboard,
      showEveryonesCatalog: true,
      showJoinRequest: true,
    },
  };
}

/**
 * Pick the most privileged role when a user holds several in one tenant.
 * 'member' loses to anything else; otherwise lexicographically stable.
 */
function pickPrimaryRole(roles: string[]): string {
  if (roles.length === 0) return 'member';
  const nonMember = roles.filter((r) => r !== 'member');
  if (nonMember.length === 0) return 'member';
  return nonMember.sort()[0];
}
