/**
 * Implements tenant/member onboarding and business setup persistence.
 * Auth remains in Prisma; this service stores only product-domain data in Mongo.
 */
import { ObjectId } from 'mongodb';
import { prisma } from '../config/database';
import { getMongoDb } from '../config/mongo';
import { PlatformRole, getPlatformRoleForEmail, normalizeEmail } from '../config/platform-admins';
import { createError } from '../middleware/errorHandler';
import {
  BusinessSetupDocument,
  MemberDocument,
  TenantDocument,
  TenantMemberDocument,
  getOnboardingCollections,
} from '../models/onboarding.models';
import { BusinessSetupInput, SkipWorkspaceInput, WorkspaceSetupInput } from '../schemas/onboarding.schemas';

export interface UserContext {
  isTenant: boolean;
  isMember: boolean;
  mode: 'tenant' | 'regular_user' | 'workspace_setup_deferred' | 'needs_workspace_setup';
  tenantId: string | null;
  memberId: string | null;
  role: string | null;
}

export interface OnboardingInfo {
  required: boolean;
  step: 'workspace_setup' | 'workspace_setup_deferred' | 'business_setup' | null;
}

export interface DashboardAuthorization {
  tenantRole: string | null;
  platformRole: PlatformRole | null;
  canSeeDevMode: boolean;
  canUseDevPlayground: boolean;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  context: UserContext;
  authorization: DashboardAuthorization;
  onboarding: OnboardingInfo;
}

/**
 * Converts a Mongo ObjectId into an API-safe string.
 * Input: optional Mongo ObjectId.
 * Output: hex string or null.
 */
function toId(value: ObjectId | undefined): string | null {
  return value?.toHexString() ?? null;
}

/**
 * Loads the authenticated Prisma user needed for `/api/me`.
 * Input: Prisma user id from a verified access token.
 * Output: public user identity or a 404 error.
 */
async function getPrismaUser(userId: string): Promise<{ id: string; email: string; fullName: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) throw createError('User not found', 404);
  return user;
}

/**
 * Builds dashboard authorization from trusted backend identity and context.
 * Input: current Prisma email and Mongo-derived user context.
 * Output: flags the dashboard can use for UX gating without exposing raw admin config.
 */
function getDashboardAuthorization(email: string, context: UserContext): DashboardAuthorization {
  const platformRole = getPlatformRoleForEmail(email);
  const canSeeDevMode = context.role === 'admin';

  return {
    tenantRole: context.role,
    platformRole,
    canSeeDevMode,
    canUseDevPlayground: canSeeDevMode && platformRole === 'nexusAdmin',
  };
}

/**
 * Finds the user's active tenant or member context from MongoDB.
 * Input: Prisma user id.
 * Output: backend-derived tenant/member context.
 */
export async function getUserContext(userId: string): Promise<UserContext> {
  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);

  const tenantMembership = await collections.tenantMembers.findOne({ userId, status: 'active' });
  if (tenantMembership) {
    return {
      isTenant: true,
      isMember: false,
      mode: 'tenant',
      tenantId: tenantMembership.tenantId.toHexString(),
      memberId: null,
      role: tenantMembership.role,
    };
  }

  const member = await collections.members.findOne({ userId, status: 'active' });
  if (member) {
    return {
      isTenant: false,
      isMember: true,
      mode: 'regular_user',
      tenantId: null,
      memberId: toId(member._id),
      role: null,
    };
  }

  const onboardingState = await collections.onboardingStates.findOne({ userId });
  if (onboardingState?.state === 'workspace_setup_deferred') {
    return {
      isTenant: false,
      isMember: false,
      mode: 'workspace_setup_deferred',
      tenantId: null,
      memberId: null,
      role: null,
    };
  }

  return {
    isTenant: false,
    isMember: false,
    mode: 'needs_workspace_setup',
    tenantId: null,
    memberId: null,
    role: null,
  };
}

/**
 * Computes dashboard onboarding requirements from trusted backend data.
 * Input: Prisma user id.
 * Output: context and the next required onboarding step.
 */
export async function getOnboardingStatus(userId: string): Promise<{ context: UserContext; onboarding: OnboardingInfo }> {
  const context = await getUserContext(userId);
  if (context.mode === 'workspace_setup_deferred') {
    return { context, onboarding: { required: true, step: 'workspace_setup_deferred' } };
  }
  if (!context.isTenant && !context.isMember) {
    return { context, onboarding: { required: true, step: 'workspace_setup' } };
  }
  if (context.isTenant) {
    const db = await getMongoDb();
    const collections = getOnboardingCollections(db);
    const tenant = await collections.tenants.findOne({ _id: new ObjectId(context.tenantId!) });
    if (tenant?.businessSetupStatus === 'not_started' || tenant?.businessSetupStatus === 'in_progress') {
      return { context, onboarding: { required: false, step: 'business_setup' } };
    }
  }
  return { context, onboarding: { required: false, step: null } };
}

/**
 * Builds the authenticated `/api/me` response.
 * Input: Prisma user id from auth middleware.
 * Output: public user identity plus Mongo-derived context.
 */
export async function getMe(userId: string): Promise<MeResponse> {
  const [user, status] = await Promise.all([getPrismaUser(userId), getOnboardingStatus(userId)]);
  return {
    user: { id: user.id, email: user.email, name: user.fullName },
    context: status.context,
    authorization: getDashboardAuthorization(user.email, status.context),
    onboarding: status.onboarding,
  };
}

/**
 * Creates a tenant workspace and admin tenant membership for a new user.
 * Input: Prisma user id and validated workspace setup fields.
 * Output: tenant id and next dashboard step.
 */
export async function createWorkspace(userId: string, input: WorkspaceSetupInput) {
  const existing = await getUserContext(userId);
  if (existing.isTenant || existing.isMember) throw createError('User already has onboarding context', 409);
  const user = await getPrismaUser(userId);

  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const now = new Date();

  const tenant: TenantDocument = {
    organizationName: input.organizationName,
    website: input.website,
    businessDescription: input.businessDescription,
    selectedUseCases: input.selectedUseCases,
    contactPhone: input.contactPhone,
    contactRole: input.contactRole,
    createdByUserId: userId,
    status: 'active',
    businessSetupStatus: 'not_started',
    createdAt: now,
    updatedAt: now,
  };

  const tenantInsert = await collections.tenants.insertOne(tenant);
  const membership: TenantMemberDocument = {
    tenantId: tenantInsert.insertedId,
    userId,
    email: normalizeEmail(user.email),
    role: 'admin',
    status: 'active',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await collections.tenantMembers.insertOne(membership);

  await collections.onboardingStates.updateOne(
    { userId },
    {
      $setOnInsert: { createdAt: now },
      $set: {
        userId,
        state: 'business_setup_required',
        skippedWorkspaceSetup: false,
        tenantId: tenantInsert.insertedId,
        updatedAt: now,
      },
      $unset: { skipReason: '', memberId: '' },
    },
    { upsert: true },
  );

  return {
    success: true,
    userType: 'tenant' as const,
    tenantId: tenantInsert.insertedId.toHexString(),
    nextStep: 'business_setup' as const,
    redirectTo: '/dashboard',
  };
}

/**
 * Handles an explicit workspace setup skip choice from the dashboard.
 * Input: Prisma user id and validated skip reason.
 * Output: member or deferred onboarding result.
 */
export async function skipWorkspaceSetup(userId: string, input: SkipWorkspaceInput) {
  const existing = await getUserContext(userId);
  if (existing.isTenant || existing.isMember) {
    return {
      success: true,
      userType: existing.isTenant ? 'tenant' as const : 'member' as const,
      mode: existing.mode,
      memberId: existing.memberId,
      redirectTo: '/dashboard',
    };
  }

  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const now = new Date();
  const user = await getPrismaUser(userId);

  if (input.skipReason === 'complete_later') {
    await collections.onboardingStates.updateOne(
      { userId },
      {
        $setOnInsert: { createdAt: now },
        $set: {
          userId,
          state: 'workspace_setup_deferred',
          skippedWorkspaceSetup: true,
          skipReason: 'complete_later',
          updatedAt: now,
        },
        $unset: { tenantId: '', memberId: '' },
      },
      { upsert: true },
    );

    return {
      success: true,
      userType: 'deferred' as const,
      mode: 'workspace_setup_deferred' as const,
      memberId: null,
      redirectTo: '/dashboard',
    };
  }

  const member: MemberDocument = {
    userId,
    email: normalizeEmail(user.email),
    status: 'active',
    onboardingSource: 'skipped_workspace_setup',
    createdAt: now,
    updatedAt: now,
  };

  const memberInsert = await collections.members.insertOne(member);
  await collections.onboardingStates.updateOne(
    { userId },
    {
      $setOnInsert: { createdAt: now },
      $set: {
        userId,
        state: 'member_created',
        skippedWorkspaceSetup: true,
        skipReason: 'regular_user',
        memberId: memberInsert.insertedId,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  return {
    success: true,
    userType: 'member' as const,
    mode: 'regular_user' as const,
    memberId: memberInsert.insertedId.toHexString(),
    redirectTo: '/dashboard',
  };
}

/**
 * Requires an active tenant membership and returns its tenant id.
 * Input: Prisma user id.
 * Output: tenant ObjectId or a 403 error.
 */
async function requireTenantId(userId: string): Promise<ObjectId> {
  const context = await getUserContext(userId);
  if (!context.isTenant || !context.tenantId) throw createError('Tenant access required', 403);
  return new ObjectId(context.tenantId);
}

/**
 * Loads the tenant's business setup draft or submission.
 * Input: Prisma user id.
 * Output: stored setup data or an empty draft response.
 */
export async function getBusinessSetup(userId: string) {
  const tenantId = await requireTenantId(userId);
  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const setup = await collections.businessSetups.findOne({ tenantId });

  return {
    tenantId: tenantId.toHexString(),
    status: setup?.status ?? 'draft',
    data: setup?.data ?? {},
    updatedAt: setup?.updatedAt ?? null,
  };
}

/**
 * Saves a tenant business setup draft.
 * Input: Prisma user id and validated setup fields.
 * Output: updated draft setup response.
 */
export async function saveBusinessSetupDraft(userId: string, data: BusinessSetupInput) {
  return upsertBusinessSetup(userId, data, 'draft');
}

/**
 * Submits a tenant business setup for review.
 * Input: Prisma user id and validated setup fields.
 * Output: submitted setup response.
 */
export async function submitBusinessSetup(userId: string, data: BusinessSetupInput) {
  return upsertBusinessSetup(userId, data, 'submitted');
}

/**
 * Upserts business setup data and mirrors status onto the tenant document.
 * Input: Prisma user id, validated setup data, and desired status.
 * Output: saved setup response.
 */
async function upsertBusinessSetup(userId: string, data: BusinessSetupInput, status: BusinessSetupDocument['status']) {
  const tenantId = await requireTenantId(userId);
  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const now = new Date();

  await collections.businessSetups.updateOne(
    { tenantId },
    {
      $setOnInsert: { tenantId, createdAt: now },
      $set: {
        data,
        status,
        updatedAt: now,
        ...(status === 'submitted' ? { submittedAt: now } : {}),
      },
    },
    { upsert: true },
  );

  await collections.tenants.updateOne(
    { _id: tenantId },
    { $set: { businessSetupStatus: status === 'submitted' ? 'submitted' : 'in_progress', updatedAt: now } },
  );

  return getBusinessSetup(userId);
}
