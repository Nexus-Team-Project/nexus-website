/**
 * Provides permission guards for MongoDB-backed NEXUS domain authorization.
 * Future domain routes should use this instead of legacy Prisma role checks.
 */
import { NextFunction, Request, Response } from 'express';
import { getDomainAuthorizationContext, hasDomainPermission } from '../services/domain-authorization.service';
import type { DomainPermission } from '../services/domain-permissions.service';
import { syncDomainIdentityForLoginUser } from '../services/domain-identity.service';
import { prisma } from '../config/database';
import { createError } from './errorHandler';

/**
 * Loads trusted login identity data for the authenticated request.
 * Input: Prisma user id from auth middleware.
 * Output: selected login fields or a 404 error.
 */
async function getAuthenticatedLoginUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, provider: true },
  });
  if (!user) throw createError('User not found', 404);
  return user;
}

/**
 * Reads tenant context from a request in a conservative way.
 * Input: Express request.
 * Output: tenant id from route params or query when present, otherwise null.
 */
function getRequestTenantId(req: Request): string | null {
  const fromParams = req.params.tenantId;
  if (typeof fromParams === 'string' && fromParams.length > 0) return fromParams;

  const fromQuery = req.query.tenantId;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;

  return null;
}

/**
 * Creates middleware that requires one domain permission.
 * Input: required domain permission.
 * Output: Express middleware that rejects missing auth or permission.
 */
export function requireDomainPermission(permission: DomainPermission) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.sub) throw createError('Authentication required', 401);

      const loginUser = await getAuthenticatedLoginUser(req.user.sub);
      const domainIdentity = await syncDomainIdentityForLoginUser(loginUser);
      const authorization = await getDomainAuthorizationContext(domainIdentity.nexusIdentityId, getRequestTenantId(req));

      if (!hasDomainPermission(authorization, permission)) {
        throw createError('Forbidden', 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
