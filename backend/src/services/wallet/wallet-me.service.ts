/**
 * Builds the wallet-scoped session read model for GET /api/v1/wallet/me.
 *
 * The wallet previously hydrated its session from the shared GET /api/me,
 * which computes (and exposes) the full dashboard payload: plan/seat billing,
 * permission flags, business-setup approval state, cover-image galleries, etc.
 * A wallet member needs none of that. This service returns exactly the fields
 * the wallet's `WalletMe` contract reads - nothing more - and resolves them in
 * one parallel wave, so the wallet session boot costs a fraction of the
 * roundtrips of the dashboard /api/me.
 *
 * Exposure rule: never add dashboard/admin-only data here (plan, seats,
 * approval state, permission booleans). If the wallet grows a need, add the
 * single field it reads.
 */
import { prisma } from '../../config/database';
import { getMongoDb } from '../../config/mongo';
import { createError } from '../../middleware/errorHandler';
import { getIdentityDomainCollections } from '../../models/domain';
import { syncDomainIdentityForLoginUser } from '../domain-identity.service';
import {
  computeWalletMeRouter,
  type MembershipSummary,
} from '../auth/wallet-me-router.service';
import { getWalletProfile, type WalletProfileView } from './wallet-profile.service';

/** The wallet session payload - mirrors the wallet client's `WalletMe` type. */
export interface WalletMeResponse {
  user: { id: string; email: string; name: string; avatarUrl: string | null };
  /**
   * Minimal tenant context, derived from the wallet memberships (privileged
   * role preferred, matching the /api/me preferred-membership rule). The
   * wallet keys its UI off `memberships`; this block exists for contract
   * compatibility with the previous /api/me shape.
   */
  context: {
    isTenant: boolean;
    tenantId: string | null;
    tenantName: string | null;
    role: string | null;
  };
  memberships: MembershipSummary[];
  /** Default landing tenant for a returning member, or null for the ecosystem. */
  defaultTenantId: string | null;
  profile: WalletProfileView | null;
  /** Canonical phone on the identity (05XXXXXXXX), or null when unset. */
  phone: string | null;
  /** ISO timestamp the phone was OTP-verified; null for an unverified number. */
  phoneVerifiedAt: string | null;
  marketingConsent: boolean;
}

/**
 * Picks the wallet context tenant from the membership list: the first
 * privileged (non-member) membership wins, else the first membership.
 * Mirrors utils/preferred-tenant-membership without extra queries - the
 * membership rows already carry the collapsed primary role per tenant.
 */
function deriveWalletContext(memberships: MembershipSummary[]): WalletMeResponse['context'] {
  const preferred = memberships.find((m) => m.isPrivilegedRole) ?? memberships[0];
  if (!preferred) {
    return { isTenant: false, tenantId: null, tenantName: null, role: null };
  }
  return {
    isTenant: true,
    tenantId: preferred.tenantId,
    tenantName: preferred.tenantName,
    role: preferred.role,
  };
}

/**
 * Resolves the authenticated wallet user's session payload.
 * Input: trusted Prisma user id from the auth middleware.
 * Output: the slim WalletMeResponse above.
 */
export async function buildWalletMe(userId: string): Promise<WalletMeResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, avatarUrl: true, provider: true },
  });
  if (!user) throw createError('User not found', 404);

  // Ensure the domain identity exists and is linked to this login user (fast
  // no-op read when already in sync - see domain-identity.service).
  const identity = await syncDomainIdentityForLoginUser({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    provider: user.provider ?? undefined,
  });

  const db = await getMongoDb();
  const [walletRouter, profile, identityDoc] = await Promise.all([
    computeWalletMeRouter(db, { nexusIdentityId: identity.nexusIdentityId, email: user.email }),
    getWalletProfile(db, { prismaUserId: user.id, email: user.email }),
    getIdentityDomainCollections(db).nexusIdentities.findOne(
      { nexusIdentityId: identity.nexusIdentityId },
      { projection: { phone: 1, phoneVerifiedAt: 1, marketingConsent: 1 } },
    ),
  ]);

  return {
    user: { id: user.id, email: user.email, name: user.fullName, avatarUrl: user.avatarUrl ?? null },
    context: deriveWalletContext(walletRouter.memberships),
    memberships: walletRouter.memberships,
    defaultTenantId: walletRouter.defaultTenantId,
    profile,
    phone: identityDoc?.phone ?? null,
    phoneVerifiedAt: identityDoc?.phoneVerifiedAt ? identityDoc.phoneVerifiedAt.toISOString() : null,
    marketingConsent: identityDoc?.marketingConsent?.granted ?? false,
  };
}
