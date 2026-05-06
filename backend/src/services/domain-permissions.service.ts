/**
 * Seeds default domain role permissions into MongoDB.
 * Authorization services will read these records instead of hardcoded UI roles.
 */
import { getMongoDb } from '../config/mongo';
import { getIdentityDomainCollections, type TenantUserRoleName } from '../models/domain';

export const DOMAIN_PERMISSIONS = [
  'tenant.view',
  'tenant.manage_team',
  'tenant.activate_services',
  'tenant.go_live',
  'catalog.view',
  'catalog.manage_exposure',
  'pricing.manage',
  'allocation.manage',
  'member.manage',
  'developer.manage_api_keys',
  'provider.manage_supply',
  'finance.view',
  'finance.manage',
  'platform.manage_providers',
  'platform.view_sagas',
  'platform.support',
] as const;

export type DomainPermission = typeof DOMAIN_PERMISSIONS[number];

const ROLE_PERMISSIONS: Record<TenantUserRoleName, readonly DomainPermission[]> = {
  admin: [
    'tenant.view',
    'tenant.manage_team',
    'tenant.activate_services',
    'tenant.go_live',
    'catalog.view',
    'catalog.manage_exposure',
    'pricing.manage',
    'allocation.manage',
    'member.manage',
    'developer.manage_api_keys',
    'provider.manage_supply',
    'finance.view',
    'finance.manage',
  ],
  finance: ['tenant.view', 'catalog.view', 'pricing.manage', 'finance.view', 'finance.manage'],
  operator: ['tenant.view', 'catalog.view', 'catalog.manage_exposure', 'allocation.manage', 'member.manage'],
  analyst: ['tenant.view', 'catalog.view', 'finance.view'],
  developer: ['tenant.view', 'developer.manage_api_keys'],
  supply_manager: ['tenant.view', 'catalog.view', 'provider.manage_supply'],
  member: ['catalog.view'],
  platform_admin: [
    'tenant.view',
    'tenant.manage_team',
    'tenant.activate_services',
    'tenant.go_live',
    'catalog.view',
    'catalog.manage_exposure',
    'pricing.manage',
    'allocation.manage',
    'member.manage',
    'developer.manage_api_keys',
    'provider.manage_supply',
    'finance.view',
    'finance.manage',
    'platform.manage_providers',
    'platform.view_sagas',
    'platform.support',
  ],
  platform_operator: ['platform.manage_providers', 'platform.view_sagas', 'platform.support'],
  platform_support: ['platform.view_sagas', 'platform.support'],
  platform_finance: ['finance.view', 'finance.manage', 'platform.view_sagas'],
};

/**
 * Builds a deterministic id for one role-permission row.
 * Input: domain role and permission.
 * Output: stable id safe for repeated upserts.
 */
function rolePermissionId(role: TenantUserRoleName, permission: DomainPermission): string {
  return `role_permission_${role}_${permission.replace(/\./g, '_')}`;
}

/**
 * Ensures default role-permission records exist in MongoDB.
 * Input: none.
 * Output: RolePermissionMap contains baseline permissions from source specs.
 */
export async function ensureDefaultRolePermissions(): Promise<void> {
  const db = await getMongoDb();
  const collections = getIdentityDomainCollections(db);
  const now = new Date();
  const writes = Object.entries(ROLE_PERMISSIONS).flatMap(([role, permissions]) =>
    permissions.map((permission) => ({
      updateOne: {
        filter: { role: role as TenantUserRoleName, permission },
        update: {
          $setOnInsert: {
            rolePermissionMapId: rolePermissionId(role as TenantUserRoleName, permission),
            role: role as TenantUserRoleName,
            permission,
            createdAt: now,
          },
          $set: {
            updatedAt: now,
          },
        },
        upsert: true,
      },
    })),
  );

  if (writes.length === 0) return;
  await collections.rolePermissionMaps.bulkWrite(writes, { ordered: false });
}
