/**
 * Reads tenant members, roles, permissions, and pending invitations.
 * Dashboard pages use this service instead of legacy Prisma organizations.
 * Member list uses a MongoDB aggregation pipeline so filters run on the DB,
 * not in application memory, enabling safe production-scale pagination.
 */
import { getMongoDb } from '../config/mongo';
import {
  getIdentityDomainCollections,
  getTenantDomainCollections,
  DOMAIN_COLLECTIONS,
  type TenantUserRoleName,
} from '../models/domain';
import { requireTenantMemberPermission } from './domain-member.service';
import { DOMAIN_PERMISSIONS, type DomainPermission } from './domain-permissions.service';
import type { ListMembersQuery } from '../schemas/domain-member-read.schemas';

/** One row in the paginated tenant member table. */
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

/** One row in the tenant role summary. */
export interface TenantRoleListItem {
  role: TenantUserRoleName;
  permissions: DomainPermission[];
}

/** One pending invitation row shown above the member table. */
export interface PendingInvitationItem {
  invitationId: string;
  email: string;
  roles: TenantUserRoleName[];
  status: string;
  expiresAt: string;
  createdAt: string;
}

/** Pagination metadata attached to paged responses. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Typed shape of one aggregation $facet row before mapping. */
interface AggregationRow {
  tenantMemberId: string;
  nexusIdentityId: string;
  tenantId: string;
  status: string;
  createdAt: Date;
  identity: Array<{ normalizedEmail: string; displayName?: string }>;
  roleRecords: Array<{ role: TenantUserRoleName }>;
  groupAssignments: Array<{ memberGroupId: string }>;
  latestInvitation: Array<{ status: string; expiresAt: Date }>;
}

/** Typed shape of the $facet output stage. */
interface FacetResult {
  rows: AggregationRow[];
  total: Array<{ n: number }>;
}

/**
 * Escapes special regex characters in a user-supplied search string.
 * Input: raw user search string.
 * Output: safe string usable in a MongoDB $regex without injection risk.
 */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lists tenant members with server-side pagination and filtering.
 * Uses a single MongoDB aggregation pipeline that joins identities, roles, and
 * group assignments on the database, then slices to the requested page.
 *
 * Input: authenticated Prisma user id, validated query params.
 * Output: paged member rows and pagination metadata.
 *
 * Note: text search uses a case-insensitive regex scan on the identity
 * documents fetched via $lookup. A MongoDB Atlas Search index would improve
 * full-text search performance beyond ~50k identities if needed in the future.
 */
export async function listTenantMembersPaginated(
  userId: string,
  query: ListMembersQuery,
): Promise<{
  tenantId: string;
  members: TenantMemberListItem[];
  pagination: PaginationMeta;
}> {
  const access = await requireTenantMemberPermission(userId, 'members.view');
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);

  // Build the aggregation pipeline stage by stage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline: Record<string, any>[] = [];

  // Stage 1: filter by tenant (and optionally by member status).
  const matchStage: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.status) matchStage.status = query.status;
  pipeline.push({ $match: matchStage });

  // Stage 2: join identity document for email and displayName.
  pipeline.push({
    $lookup: {
      from: DOMAIN_COLLECTIONS.nexusIdentities,
      let: { identityId: '$nexusIdentityId' },
      pipeline: [
        { $match: { $expr: { $eq: ['$nexusIdentityId', '$$identityId'] } } },
        { $project: { normalizedEmail: 1, displayName: 1, _id: 0 } },
      ],
      as: 'identity',
    },
  });

  // Stage 3: join tenant role records for this member.
  pipeline.push({
    $lookup: {
      from: DOMAIN_COLLECTIONS.tenantUserRoles,
      let: { identityId: '$nexusIdentityId', tId: '$tenantId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$nexusIdentityId', '$$identityId'] },
                { $eq: ['$tenantId', '$$tId'] },
              ],
            },
          },
        },
        { $project: { role: 1, _id: 0 } },
      ],
      as: 'roleRecords',
    },
  });

  // Stage 4: if role filter is active, keep only members who have that role.
  if (query.role) {
    pipeline.push({ $match: { 'roleRecords.role': query.role } });
  }

  // Stage 5: if search is active, filter on email or displayName.
  if (query.search) {
    const safePattern = escapeRegex(query.search);
    pipeline.push({
      $match: {
        $or: [
          { 'identity.normalizedEmail': { $regex: safePattern, $options: 'i' } },
          { 'identity.displayName': { $regex: safePattern, $options: 'i' } },
        ],
      },
    });
  }

  // Stage 6: single $facet for paginated rows and total count.
  const skip = (query.page - 1) * query.limit;
  pipeline.push({
    $facet: {
      rows: [
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: query.limit },
        // Fetch group memberships only for the visible slice.
        {
          $lookup: {
            from: DOMAIN_COLLECTIONS.memberGroupAssignments,
            let: { memberId: '$tenantMemberId' },
            pipeline: [
              { $match: { $expr: { $eq: ['$tenantMemberId', '$$memberId'] } } },
              { $project: { memberGroupId: 1, _id: 0 } },
            ],
            as: 'groupAssignments',
          },
        },
        // Fetch the most recent invitation to show invitation status.
        {
          $lookup: {
            from: DOMAIN_COLLECTIONS.tenantMemberInvitations,
            let: { memberId: '$tenantMemberId' },
            pipeline: [
              { $match: { $expr: { $eq: ['$tenantMemberId', '$$memberId'] } } },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              { $project: { status: 1, expiresAt: 1, _id: 0 } },
            ],
            as: 'latestInvitation',
          },
        },
      ],
      total: [{ $count: 'n' }],
    },
  });

  const [facetResult] = await tenantCollections.tenantMembers
    .aggregate<FacetResult>(pipeline)
    .toArray();

  const rows = facetResult?.rows ?? [];
  const totalCount = facetResult?.total[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(totalCount / query.limit));

  const members: TenantMemberListItem[] = rows.map((row) => {
    const identity = row.identity[0];
    const latestInv = row.latestInvitation[0];
    return {
      tenantMemberId: row.tenantMemberId,
      nexusIdentityId: row.nexusIdentityId,
      email: identity?.normalizedEmail ?? '',
      displayName: identity?.displayName ?? null,
      status: row.status,
      invitationStatus: latestInv?.status ?? null,
      invitationExpiresAt: latestInv?.expiresAt?.toISOString() ?? null,
      roles: row.roleRecords.map((r) => r.role),
      groupIds: row.groupAssignments.map((a) => a.memberGroupId),
      joinedAt: row.createdAt.toISOString(),
    };
  });

  return {
    tenantId: access.tenantId,
    members,
    pagination: { page: query.page, limit: query.limit, total: totalCount, pages },
  };
}

/** Maximum pending invitations returned in the pending-invitations panel. */
const PENDING_INVITE_CAP = 200;

/**
 * Lists pending tenant member invitations for the admin panel above the member table.
 * Returns at most 200 records. The `hasMore` flag signals that more exist.
 * Uses the indexed { tenantId, status, createdAt } index for fast retrieval.
 *
 * Input: authenticated Prisma user id with member-view access.
 * Output: pending invitation rows and a hasMore flag.
 */
export async function listPendingInvitationsForTenant(userId: string): Promise<{
  pendingInvitations: PendingInvitationItem[];
  total: number;
  hasMore: boolean;
}> {
  const access = await requireTenantMemberPermission(userId, 'members.view');
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);

  // Fetch one extra record to detect whether more exist beyond the cap.
  const raw = await tenantCollections.tenantMemberInvitations
    .find(
      { tenantId: access.tenantId, status: 'pending' },
      {
        sort: { createdAt: -1 },
        limit: PENDING_INVITE_CAP + 1,
        projection: {
          tenantMemberInvitationId: 1,
          normalizedEmail: 1,
          roles: 1,
          role: 1,
          status: 1,
          expiresAt: 1,
          createdAt: 1,
        },
      },
    )
    .toArray();

  const hasMore = raw.length > PENDING_INVITE_CAP;
  const records = raw.slice(0, PENDING_INVITE_CAP);

  const pendingInvitations: PendingInvitationItem[] = records.map((inv) => {
    // Normalise legacy single-role field alongside the new multi-role array.
    const roles: TenantUserRoleName[] =
      Array.isArray(inv.roles) && inv.roles.length > 0
        ? (inv.roles as TenantUserRoleName[])
        : (inv as unknown as { role?: string }).role
          ? ([(inv as unknown as { role: string }).role as TenantUserRoleName])
          : [];
    return {
      invitationId: inv.tenantMemberInvitationId ?? '',
      email: inv.normalizedEmail,
      roles,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    };
  });

  return {
    pendingInvitations,
    total: hasMore ? PENDING_INVITE_CAP : records.length,
    hasMore,
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
  await requireTenantMemberPermission(userId, 'members.view');
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
