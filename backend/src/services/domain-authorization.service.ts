/**
 * Resolves tenant-scoped domain roles and permissions from MongoDB.
 * This service prepares backend routes to stop relying on legacy Prisma roles.
 */
import { getMongoDb } from '../config/mongo';
import {
  getIdentityDomainCollections,
  getTenantDomainCollections,
  type TenantUserRoleName,
} from '../models/domain';
import type { DomainPermission } from './domain-permissions.service';

export interface DomainAuthorizationContext {
  nexusIdentityId: string;
  tenantId: string | null;
  tenantMemberId: string | null;
  roles: TenantUserRoleName[];
  permissions: DomainPermission[];
}

const TENANT_ROLE_PRIORITY: readonly TenantUserRoleName[] = [
  'owner',
  'admin',
  'back_office_manager',
  'hr_manager',
  'finance',
  'billing_manager',
  'payments_manager',
  'support_agent',
  'developer',
  'supply_manager',
  'member',
  // Deprecated - kept at end so they resolve last for any existing DB rows
  'operator',
  'analyst',
] as const;

/**
 * Deduplicates string values while keeping stable insertion order.
 * Input: string array.
 * Output: array with duplicates removed.
 */
function uniqueValues<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Loads all permissions granted to a set of roles.
 * Input: role names from TenantUserRole records.
 * Output: unique permission strings from RolePermissionMap.
 */
async function getPermissionsForRoles(roles: TenantUserRoleName[]): Promise<DomainPermission[]> {
  if (roles.length === 0) return [];

  const db = await getMongoDb();
  const collections = getIdentityDomainCollections(db);
  const records = await collections.rolePermissionMaps
    .find({ role: { $in: roles } }, { projection: { permission: 1 } })
    .toArray();

  return uniqueValues(records.map((record) => record.permission as DomainPermission));
}

/**
 * Resolves authorization for one identity and optional tenant.
 * Input: domain identity id and tenant id when a tenant context is selected.
 * Output: roles, permissions, and tenant member id if one exists.
 */
export async function getDomainAuthorizationContext(
  nexusIdentityId: string,
  tenantId: string | null,
): Promise<DomainAuthorizationContext> {
  const db = await getMongoDb();
  const identityCollections = getIdentityDomainCollections(db);
  const tenantCollections = getTenantDomainCollections(db);
  const [roleRecords, tenantMember] = await Promise.all([
    identityCollections.tenantUserRoles
      .find({ nexusIdentityId, tenantId }, { projection: { role: 1 } })
      .toArray(),
    tenantId
      ? tenantCollections.tenantMembers.findOne(
          { nexusIdentityId, tenantId, status: 'active' },
          { projection: { tenantMemberId: 1 } },
        )
      : Promise.resolve(null),
  ]);
  const roles = uniqueValues(roleRecords.map((record) => record.role));
  const permissions = await getPermissionsForRoles(roles);

  return {
    nexusIdentityId,
    tenantId,
    tenantMemberId: tenantMember?.tenantMemberId ?? null,
    roles,
    permissions,
  };
}

/**
 * Checks whether an authorization context includes a permission.
 * Input: resolved domain authorization context and required permission.
 * Output: true when permission is granted.
 */
export function hasDomainPermission(
  context: DomainAuthorizationContext,
  permission: DomainPermission,
): boolean {
  return context.permissions.includes(permission);
}

/**
 * Chooses the primary tenant role to keep legacy dashboard responses stable.
 * Input: additive domain roles for one tenant.
 * Output: highest-priority tenant role or null when no tenant role exists.
 */
export function getPrimaryTenantRole(roles: TenantUserRoleName[]): TenantUserRoleName | null {
  return TENANT_ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null;
}

/**
 * Extracts the tenant id from a domain authorization context.
 * Input: DomainAuthorizationContext resolved for a user.
 * Output: tenantId string or null if user has no active tenant membership.
 */
export function getTenantIdForIdentity(auth: DomainAuthorizationContext): string | null {
  return auth.tenantId ?? null;
}
