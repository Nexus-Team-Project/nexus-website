/**
 * Shared helper for resolving tenant context from an authenticated request.
 * Used by offers and purchase routes to identify the requesting tenant and identity,
 * and to enforce domain permissions against the real tenant scope (not a URL param).
 *
 * Security note: tenant id is always derived from server-side MongoDB membership,
 * never from any browser-supplied value. This is critical for all supply/catalog
 * operations where the tenant context determines what data the user can read or write.
 *
 * Platform admin fast-path: emails listed in NEXUS_ADMIN_EMAILS bypass the tenant
 * membership check and receive tenantId = 'nexus_platform'. This allows them to
 * create ecosystem-wide offers without owning a tenant workspace.
 */
import type { Request } from 'express';
import { prisma } from '../config/database';
import { getMongoDb } from '../config/mongo';
import { syncDomainIdentityForLoginUser } from '../services/domain-identity.service';
import {
  getDomainAuthorizationContext,
  hasDomainPermission,
} from '../services/domain-authorization.service';
import { getTenantDomainCollections } from '../models/domain/tenant.models';
import type { DomainPermission } from '../services/domain-permissions.service';
import { isPlatformAdminEmail, NEXUS_PLATFORM_TENANT_ID } from './platform-admin';

/** Resolved tenant and identity ids for the authenticated request user. */
export interface TenantContext {
  /** MongoDB tenantId derived from the user's active tenant membership.
   *  For platform admins this is the sentinel value 'nexus_platform'. */
  tenantId: string;
  /** MongoDB NexusIdentity id for the authenticated user. */
  identityId: string;
  /** True when the user is a NEXUS platform admin (NEXUS_ADMIN_EMAILS). */
  isPlatformAdmin: boolean;
}

/**
 * Resolves tenant id and Nexus identity id for the authenticated request user.
 *
 * Looks up the active TenantMember record in MongoDB to find the tenantId.
 * This is the authoritative server-side derivation of tenant context - never
 * trust any tenant id sent from the browser.
 *
 * Input:  Express request with req.user.sub set by authenticate middleware.
 * Output: { tenantId, identityId } for the user's active tenant membership.
 * Throws: Error with status 404 when the login user is not found.
 *         Error with status 403 when the user has no active tenant membership.
 */
export async function resolveTenantContext(req: Request): Promise<TenantContext> {
  const loginUser = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, email: true, fullName: true, provider: true },
  });
  if (!loginUser) throw Object.assign(new Error('User not found'), { status: 404 });

  // Platform admin fast-path: skip tenant membership check entirely.
  // Admins use the sentinel tenantId so their supply records are clearly attributed.
  if (isPlatformAdminEmail(loginUser.email)) {
    const domainIdentity = await syncDomainIdentityForLoginUser(loginUser);
    return {
      tenantId: NEXUS_PLATFORM_TENANT_ID,
      identityId: domainIdentity.nexusIdentityId,
      isPlatformAdmin: true,
    };
  }

  const domainIdentity = await syncDomainIdentityForLoginUser(loginUser);

  // Derive tenantId from the domain TenantMember record - never from the browser.
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const tenantMember = await tenantCollections.tenantMembers.findOne(
    { nexusIdentityId: domainIdentity.nexusIdentityId, status: 'active' },
    { sort: { createdAt: 1 }, projection: { tenantId: 1 } },
  );

  if (!tenantMember) {
    throw Object.assign(new Error('No tenant context'), { status: 403 });
  }

  return { tenantId: tenantMember.tenantId, identityId: domainIdentity.nexusIdentityId, isPlatformAdmin: false };
}

/**
 * Resolves tenant context AND verifies the required domain permission.
 *
 * Combines tenant context resolution with a permission check scoped to the
 * user's actual tenant. This is required for offer routes where the tenant id
 * does not appear in the URL params (which would cause requireDomainPermission
 * middleware to resolve with null tenantId and find no tenant role assignments).
 *
 * Input:
 *   req        - Express request with req.user.sub set by authenticate middleware.
 *   permission - The domain permission to enforce for this action.
 * Output: { tenantId, identityId } when the user holds the required permission.
 * Throws: Error with status 404 when the login user is not found.
 *         Error with status 403 when user has no tenant membership or lacks permission.
 */
export async function resolveTenantContextWithPermission(
  req: Request,
  permission: DomainPermission,
): Promise<TenantContext> {
  const context = await resolveTenantContext(req);

  // Platform admins bypass all permission checks - they have full supply/catalog access.
  if (context.isPlatformAdmin) return context;

  // Re-check authorization scoped to the real tenantId so role lookups are correct.
  const auth = await getDomainAuthorizationContext(context.identityId, context.tenantId);
  if (!hasDomainPermission(auth, permission)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  return context;
}
