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
  /** Public logo URL of the tenant, when set on domainTenants. */
  logoUrl?: string;
  /** Org brand color ("#rrggbb"), when set; drives the wallet first-login accent. */
  brandColor?: string;
  /** The collapsed primary role (admin beats member when both are held). */
  role: string;
  isPrivilegedRole: boolean;
  /**
   * Whether the user holds the 'member' role in this tenant (independent of
   * also holding a privileged role). The wallet uses THIS - not
   * !isPrivilegedRole - to decide whether the tenant's catalog is browsable,
   * so a user who is both admin AND member still sees the catalog.
   */
  isMember: boolean;
}

export interface MemberTenantSummary {
  tenantId: string;
  tenantName: string;
}

export interface WalletMeRouter {
  memberships: MembershipSummary[];
  isPlatformAdmin: boolean;
  canOpenDashboard: boolean;
  /**
   * Effective default landing context for a returning member: a tenantId
   * to land on that tenant's catalog, or null for the Nexus (ecosystem)
   * catalog. Resolves the member's explicit choice (walletDefaultTenantId)
   * when still valid, else the last-joined tenant, else ecosystem (null).
   */
  defaultTenantId: string | null;
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
        { projection: { tenantId: 1, organizationName: 1, logoUrl: 1, brandColor: 1 } },
      )
      .toArray();
    const nameByTenant = new Map<string, string>();
    const logoByTenant = new Map<string, string>();
    const colorByTenant = new Map<string, string>();
    for (const t of tenantDocs) {
      const raw = (t as { organizationName?: string }).organizationName;
      nameByTenant.set(t.tenantId, raw && raw.trim() ? raw : 'Tenant');
      const logo = (t as { logoUrl?: string }).logoUrl;
      if (logo && logo.trim()) logoByTenant.set(t.tenantId, logo);
      const color = (t as { brandColor?: string }).brandColor;
      if (color && color.trim()) colorByTenant.set(t.tenantId, color);
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
        logoUrl: logoByTenant.get(tenantId),
        brandColor: colorByTenant.get(tenantId),
        role,
        isPrivilegedRole: PRIVILEGED_NON_MEMBER(role),
        isMember: roles.includes('member'),
      });
    }
  }

  const memberTenants: MemberTenantSummary[] = memberships
    .filter((m) => m.isMember)
    .map((m) => ({ tenantId: m.tenantId, tenantName: m.tenantName }));
  const canOpenDashboard = isPlatformAdmin || memberships.some((m) => m.isPrivilegedRole);

  // Effective default landing context (returning members). Read the
  // member's explicit choice, then fall back to the last-joined tenant.
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const identityDoc = await nexusIdentities.findOne(
    { nexusIdentityId: args.nexusIdentityId },
    { projection: { walletDefaultTenantId: 1 } },
  );
  const storedDefault = (identityDoc as { walletDefaultTenantId?: string } | null)?.walletDefaultTenantId;
  // Wallet is member-facing: only 'member'-role tenants are valid landing
  // contexts. Tenants the user merely administers (privileged roles) are NOT
  // wallet member contexts - those belong in the dashboard - so they never
  // become a default and a privileged-only user defaults to the ecosystem.
  const memberTenantIds = new Set(memberTenants.map((t) => t.tenantId));
  const defaultTenantId = resolveDefaultTenant(storedDefault, memberTenantIds, allRoles);

  return {
    memberships,
    isPlatformAdmin,
    canOpenDashboard,
    defaultTenantId,
    router: {
      showMemberTenants: memberTenants,
      showAdminEntry: canOpenDashboard,
      showEveryonesCatalog: true,
      showJoinRequest: true,
    },
  };
}

/**
 * Resolve the effective default landing tenant for a returning member.
 *
 * @param stored      the member's explicit choice: a tenantId, the literal
 *                    'ecosystem', or undefined when never set.
 * @param memberTenantIds tenantIds the member currently belongs to.
 * @param roles       the member's tenantUserRole rows (carry createdAt).
 * @returns a tenantId to land on, or null for the ecosystem catalog.
 *
 * Order: an explicit 'ecosystem' wins; an explicit tenant wins while still
 * a member; otherwise the last-joined tenant (latest per-tenant earliest
 * role createdAt); otherwise null (no memberships → ecosystem).
 */
function resolveDefaultTenant(
  stored: string | undefined,
  memberTenantIds: Set<string>,
  roles: Array<{ tenantId: string | null; createdAt: Date }>,
): string | null {
  if (stored === 'ecosystem') return null;
  if (stored && memberTenantIds.has(stored)) return stored;
  // Last-joined: per tenant, take the earliest role createdAt (when they
  // joined that tenant), then pick the tenant whose join time is latest.
  const joinedAtByTenant = new Map<string, number>();
  for (const r of roles) {
    if (!r.tenantId || !memberTenantIds.has(r.tenantId)) continue;
    const t = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    const prev = joinedAtByTenant.get(r.tenantId);
    if (prev === undefined || t < prev) joinedAtByTenant.set(r.tenantId, t);
  }
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const [tenantId, t] of joinedAtByTenant) {
    if (t > bestTime) {
      bestTime = t;
      best = tenantId;
    }
  }
  return best;
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
