/**
 * Reads tenant members, roles, permissions, and safe invite previews.
 * Dashboard pages use this service instead of legacy Prisma organizations.
 */
import { getMongoDb } from '../config/mongo';
import {
  getIdentityDomainCollections,
  getTenantDomainCollections,
  type TenantUserRoleName,
} from '../models/domain';
import { requireTenantMemberPermission } from './domain-member.service';
import { DOMAIN_PERMISSIONS, type DomainPermission } from './domain-permissions.service';

export interface TenantMemberListItem {
  tenantMemberId: string;
  nexusIdentityId: string;
  email: string;
  displayName: string | null;
  status: string;
  invitationStatus: string | null;
  invitationExpiresAt: string | null;
  roles: TenantUserRoleName[];
  groupIds: string[];
  joinedAt: string;
}

export interface TenantRoleListItem {
  role: TenantUserRoleName;
  permissions: DomainPermission[];
}

/**
 * Lists tenant members visible to the tenant admin/member manager.
 * Input: authenticated Prisma user id.
 * Output: tenant member rows with identity email, roles, and group ids.
 */
export async function listTenantMembersForManager(userId: string): Promise<{
  tenantId: string;
  members: TenantMemberListItem[];
}> {
  const access = await requireTenantMemberPermission(userId, 'member.view');
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);
  const members = await tenantCollections.tenantMembers
    .find({ tenantId: access.tenantId }, { sort: { createdAt: -1 } })
    .toArray();
  const memberIds = members.map((member) => member.tenantMemberId);
  const invitations = await tenantCollections.tenantMemberInvitations
    .find(
      { tenantId: access.tenantId },
      {
        sort: { createdAt: -1 },
        projection: {
          tenantMemberId: 1,
          nexusIdentityId: 1,
          normalizedEmail: 1,
          role: 1,
          status: 1,
          expiresAt: 1,
          createdAt: 1,
        },
      },
    )
    .toArray();
  const identityIds = Array.from(new Set([
    ...members.map((member) => member.nexusIdentityId),
    ...invitations.map((invitation) => invitation.nexusIdentityId),
  ]));
  const [identities, roles, assignments] = await Promise.all([
    identityCollections.nexusIdentities
      .find({ nexusIdentityId: { $in: identityIds } }, { projection: { nexusIdentityId: 1, normalizedEmail: 1, displayName: 1 } })
      .toArray(),
    identityCollections.tenantUserRoles
      .find({ tenantId: access.tenantId, nexusIdentityId: { $in: identityIds } }, { projection: { nexusIdentityId: 1, role: 1 } })
      .toArray(),
    tenantCollections.memberGroupAssignments
      .find({ tenantMemberId: { $in: memberIds } }, { projection: { tenantMemberId: 1, memberGroupId: 1 } })
      .toArray(),
  ]);
  const identityById = new Map(identities.map((identity) => [identity.nexusIdentityId, identity]));
  const rolesByIdentity = new Map<string, TenantUserRoleName[]>();
  const groupsByMember = new Map<string, string[]>();
  const invitationByMember = new Map<string, { status: string; expiresAt: Date; role: TenantUserRoleName; createdAt: Date }>();

  for (const role of roles) {
    rolesByIdentity.set(role.nexusIdentityId, [...(rolesByIdentity.get(role.nexusIdentityId) ?? []), role.role]);
  }
  for (const assignment of assignments) {
    groupsByMember.set(assignment.tenantMemberId, [
      ...(groupsByMember.get(assignment.tenantMemberId) ?? []),
      assignment.memberGroupId,
    ]);
  }
  for (const invitation of invitations) {
    if (!invitationByMember.has(invitation.tenantMemberId)) {
      invitationByMember.set(invitation.tenantMemberId, {
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        role: invitation.role as TenantUserRoleName,
        createdAt: invitation.createdAt,
      });
    }
  }
  const memberIdsSet = new Set(members.map((member) => member.tenantMemberId));

  return {
    tenantId: access.tenantId,
    members: [
      ...members.map((member) => {
      const identity = identityById.get(member.nexusIdentityId);
      const invitation = invitationByMember.get(member.tenantMemberId);
      return {
        tenantMemberId: member.tenantMemberId,
        nexusIdentityId: member.nexusIdentityId,
        email: identity?.normalizedEmail ?? '',
        displayName: identity?.displayName ?? null,
        status: member.status,
        invitationStatus: invitation?.status ?? null,
        invitationExpiresAt: invitation?.expiresAt.toISOString() ?? null,
        roles: rolesByIdentity.get(member.nexusIdentityId) ?? [],
        groupIds: groupsByMember.get(member.tenantMemberId) ?? [],
        joinedAt: member.createdAt.toISOString(),
      };
      }),
      ...invitations
        .filter((invitation) => !memberIdsSet.has(invitation.tenantMemberId))
        .map((invitation) => {
          const identity = identityById.get(invitation.nexusIdentityId);
          return {
            tenantMemberId: invitation.tenantMemberId,
            nexusIdentityId: invitation.nexusIdentityId,
            email: identity?.normalizedEmail ?? invitation.normalizedEmail,
            displayName: identity?.displayName ?? null,
            status: invitation.status === 'pending' ? 'pending_invitation' : invitation.status,
            invitationStatus: invitation.status,
            invitationExpiresAt: invitation.expiresAt.toISOString(),
            roles: [invitation.role as TenantUserRoleName],
            groupIds: [],
            joinedAt: invitation.createdAt.toISOString(),
          };
        }),
    ],
  };
}

/**
 * Lists roles and permissions from Mongo RolePermissionMap records.
 * Input: authenticated Prisma user id with member-view access.
 * Output: tenant-scoped roles and their permission strings.
 */
export async function listTenantRolesForManager(userId: string): Promise<{
  roles: TenantRoleListItem[];
}> {
  await requireTenantMemberPermission(userId, 'member.view');
  const db = await getMongoDb();
  const identityCollections = getIdentityDomainCollections(db);
  const roleRecords = await identityCollections.rolePermissionMaps
    .find({ permission: { $in: DOMAIN_PERMISSIONS } }, { sort: { role: 1, permission: 1 } })
    .toArray();
  const rolesByName = new Map<TenantUserRoleName, DomainPermission[]>();

  for (const record of roleRecords) {
    if (record.role.startsWith('platform_')) continue;
    rolesByName.set(record.role, [...(rolesByName.get(record.role) ?? []), record.permission as DomainPermission]);
  }

  return {
    roles: Array.from(rolesByName.entries()).map(([role, permissions]) => ({ role, permissions })),
  };
}
