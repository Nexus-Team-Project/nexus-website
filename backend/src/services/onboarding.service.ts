/**
 * Implements tenant/member onboarding and business setup persistence.
 * Auth remains in Prisma; this service stores only product-domain data in Mongo.
 */
import { ObjectId } from 'mongodb';
import { prisma } from '../config/database';
import { getMongoDb } from '../config/mongo';
import { PlatformRole, getPlatformRoleForEmail, normalizeEmail } from '../config/platform-admins';
import { isPlatformAdminEmail } from '../utils/platform-admin';
import { findPreferredTenantMembership } from '../utils/preferred-tenant-membership';
import { createError } from '../middleware/errorHandler';
import {
  BusinessSetupDocument,
  MemberDocument,
  TenantDocument,
  TenantMemberDocument,
  getOnboardingCollections,
} from '../models/onboarding.models';
import { getIdentityDomainCollections, getTenantDomainCollections } from '../models/domain';
import { DEFAULT_MEMBER_SERVICES, type LogoCrop } from '../models/domain/tenant.models';
import { BusinessSetupInput, SkipWorkspaceInput, WorkspaceSetupInput } from '../schemas/onboarding.schemas';
import { getDomainAuthorizationContext, getPrimaryTenantRole, hasDomainPermission } from './domain-authorization.service';
import { syncDomainIdentityForLoginUser } from './domain-identity.service';
import { syncDomainTenantMembership } from './domain-tenant-sync.service';
import { nextApprovalOnSubmit, approvalAuthFields } from './business-setup-approval.helper';
import { sendBusinessSetupSubmittedToAdmins } from './business-setup-approval-email.service';
import { syncOnboardingMemberEmail } from './onboarding-identity.service';
import type { DomainPermission } from './domain-permissions.service';
import { getTenantPlanSummary, type TenantPlanSummary } from './domain-tenant-plan.service';
import { isNoTenantPlatformAdmin } from './onboarding-admin.helper';
import { classifyOnboardingPhone } from './onboarding/onboarding-phone.helper';
import {
  hasVerifiedOnboardingPhone,
  consumeVerifiedOnboardingPhone,
} from './onboarding/onboarding-phone-otp.service';
import { createOnboardingLead } from './monday-lead.service';

export interface UserContext {
  isTenant: boolean;
  isMember: boolean;
  mode: 'tenant' | 'regular_user' | 'workspace_setup_deferred' | 'needs_workspace_setup' | 'platform_admin';
  tenantId: string | null;
  tenantName: string | null;
  memberId: string | null;
  role: string | null;
}

export interface OnboardingInfo {
  required: boolean;
  step: 'workspace_setup' | 'workspace_setup_deferred' | 'business_setup' | null;
  /** True when the post-onboarding welcome popup must block the dashboard. */
  welcomePending?: boolean;
}

export interface DashboardAuthorization {
  tenantRole: string | null;
  platformRole: PlatformRole | null;
  /** True when the user is a NEXUS platform admin (NEXUS_ADMIN_EMAILS). */
  isPlatformAdmin: boolean;
  canSeeDevMode: boolean;
  canUseDevPlayground: boolean;
  canViewMembers: boolean;
  canManageMembers: boolean;
  /** True when the user can create or manage supply catalog offers. */
  canManageSupply: boolean;
  /** Catalog activation mode derived from TenantServiceActivation + Tenant.status. */
  catalogMode: 'inactive' | 'sandbox' | 'live';
  /** True when the benefits_catalog service is active for this tenant. */
  catalogServiceActive: boolean;
  /** True when this user holds the 'member' role AND the catalog is not inactive. */
  canPurchaseCatalog: boolean;
  /**
   * Services this member was granted at invite time (e.g. ['benefits_catalog']).
   * Empty array for platform admins or users with no domain tenant membership.
   */
  memberServices: string[];
  /** True when business setup is complete and the tenant can go live. */
  businessSetupComplete: boolean;
  /** True when a platform admin has APPROVED this tenant's business setup (M8). */
  businessSetupApproved: boolean;
  /** Raw approval state for the tenant-side indicator; null = never submitted. */
  businessSetupApprovalStatus: 'pending' | 'approved' | 'denied' | null;
  /** Denial reason (only when status === 'denied'), for the tenant-side indicator. */
  businessSetupApprovalReason: string | null;
  /**
   * True when a platform admin has marked this tenant as auto-approve/trusted
   * (`Tenant.autoApproveOffers`), so its ecosystem offers publish immediately
   * (active) instead of waiting in the per-offer approval queue. Used to word the
   * offer-visibility hint. Always false for non-tenant users.
   */
  offersAutoApproved: boolean;
}

export interface TenantSeats {
  used: number;
  limit: number;
  remaining: number;
  isAtLimit: boolean;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    /** Google profile photo URL (from OAuth), or null. Wallet uses it for the
     *  authenticated user avatar; falls back to initials when null. */
    avatarUrl?: string | null;
  };
  context: UserContext & {
    plan?: string;
    seats?: TenantSeats;
    /** Cloudinary URL of the tenant's logo, or null -> the dashboard shows the
     *  tenant-name initials. */
    tenantLogoUrl?: string | null;
    /** Crop of the logo (normalized fractions), or null -> show the full logo. */
    tenantLogoCrop?: LogoCrop | null;
    /** Org brand color ("#rrggbb"), or null -> wallet derives one from the id. */
    tenantBrandColor?: string | null;
  };
  authorization: DashboardAuthorization;
  onboarding: OnboardingInfo;
  /**
   * Wallet RouterScreen payload. Lists the user's member tenants,
   * platform-admin status, and whether to show the admin-dashboard
   * card. See services/auth/wallet-me-router.service.ts.
   */
  memberships?: import('./auth/wallet-me-router.service').MembershipSummary[];
  isPlatformAdmin?: boolean;
  canOpenDashboard?: boolean;
  /**
   * Effective default landing context for a returning member (a tenantId,
   * or null for the Nexus ecosystem catalog). Drives resolvePostLogin when
   * the user logs in without a ?tenant in the URL.
   */
  defaultTenantId?: string | null;
  router?: import('./auth/wallet-me-router.service').WalletMeRouter['router'];
  /**
   * Wallet profile sub-doc (Plan #3). completedAt is the gate the
   * wallet LoginSheet checks - if set, returning user skips the
   * slide chain and goes straight to RouterScreen.
   */
  profile?: import('./wallet/wallet-profile.service').WalletProfileView | null;
  /** Canonical phone on the NexusIdentity (05XXXXXXXX), or null when unset. */
  phone?: string | null;
  /** ISO timestamp the phone was OTP-verified; null for a test-attached number. */
  phoneVerifiedAt?: string | null;
  /** Whether the member opted in to marketing. Drives the wallet profile toggle
   *  initial state; collected in the auth-flow consent question. */
  marketingConsent?: boolean;
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
async function getPrismaUser(userId: string): Promise<{ id: string; email: string; fullName: string; provider: string; avatarUrl: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, provider: true, avatarUrl: true },
  });
  if (!user) throw createError('User not found', 404);
  return user;
}

/**
 * Derives the catalog operating mode for a tenant from service activation state
 * and the tenant's live status.
 * Input: tenantId (null when user has no tenant), tenant domain status from Mongo,
 *        and the typed TenantDomainCollections returned by getTenantDomainCollections.
 * Output: 'inactive' when the service is not activated; 'sandbox' when active but
 *         the tenant is not yet live; 'live' when active and tenant.status === 'active'.
 */
async function resolveCatalogMode(
  tenantId: string | null,
  tenantStatus: string | null,
  tenantCollections: ReturnType<typeof getTenantDomainCollections>,
): Promise<'inactive' | 'sandbox' | 'live'> {
  if (!tenantId) return 'inactive';
  const activation = await tenantCollections.tenantServiceActivations.findOne({
    tenantId,
    serviceKey: 'benefits_catalog',
    status: 'active',
  });
  if (!activation) return 'inactive';
  return tenantStatus === 'active' ? 'live' : 'sandbox';
}

/**
 * Builds dashboard authorization from trusted backend identity and context.
 * Catalog fields (catalogMode, catalogServiceActive, canPurchaseCatalog) are
 * resolved asynchronously in getMe() and merged into the returned object there.
 * Input: current Prisma email, Mongo-derived user context, and resolved permissions.
 * Output: base authorization flags; catalog fields default to inactive until merged.
 */
function getDashboardAuthorization(
  email: string,
  context: UserContext,
  permissions: DomainPermission[],
): DashboardAuthorization {
  const platformRole = getPlatformRoleForEmail(email);
  const adminByEmail = isPlatformAdminEmail(email);
  const canSeeDevMode = context.role === 'admin' || context.role === 'owner';

  return {
    tenantRole: context.role,
    platformRole,
    isPlatformAdmin: adminByEmail,
    canSeeDevMode,
    canUseDevPlayground: canSeeDevMode && platformRole === 'nexusAdmin',
    canViewMembers: permissions.includes('members.view') || permissions.includes('team.view_members'),
    canManageMembers: permissions.includes('team.invite_member') && permissions.includes('roles.assign'),
    // Platform admins can always manage supply; tenant supply_managers get it via domain permissions.
    canManageSupply: adminByEmail || permissions.includes('supply.ingest') || permissions.includes('supply.manage_offers'),
    // Catalog fields are overwritten in getMe() after async resolution.
    catalogMode: 'inactive',
    catalogServiceActive: false,
    canPurchaseCatalog: false,
    // memberServices is overwritten in getMe() after the domain TenantMember document is fetched.
    memberServices: [],
    // businessSetupComplete is overwritten in getMe() after the tenantOnboardingStates lookup.
    businessSetupComplete: false,
    // M8 approval fields - overwritten in getMe() after the domain tenant lookup.
    businessSetupApproved: false,
    businessSetupApprovalStatus: null,
    businessSetupApprovalReason: null,
    // Overwritten in getMe() after the domain tenant lookup (autoApproveOffers).
    offersAutoApproved: false,
  };
}

/**
 * Replaces legacy context role with the primary domain role when available.
 * Input: current dashboard context and additive domain roles.
 * Output: context with same response shape and source-of-truth tenant role.
 */
function applyDomainRoleToContext(context: UserContext, domainRole: string | null): UserContext {
  if (!context.isTenant || !domainRole) return context;
  return {
    ...context,
    role: domainRole,
  };
}

/**
 * Finds a tenant context from the source-of-truth domain member records.
 * Input: trusted Prisma login user id.
 * Output: tenant context when an invited user has no legacy onboarding member.
 */
async function getDomainTenantContextForUser(userId: string): Promise<UserContext | null> {
  const user = await getPrismaUser(userId);
  const identity = await syncDomainIdentityForLoginUser({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    provider: user.provider,
  });
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);
  // Privileged (non-member) memberships win over plain member ones, so an
  // admin-assigned tenant OWNER who is also a member elsewhere resolves into
  // the tenant they own (see utils/preferred-tenant-membership).
  const tenantMember = await findPreferredTenantMembership(db, identity.nexusIdentityId);
  if (!tenantMember) return null;

  // Admin-created tenants: the assigned owner's first context resolution locks
  // the replace/remove typo window (see admin-organizations.service).
  await tenantCollections.domainTenants.updateOne(
    {
      tenantId: tenantMember.tenantId,
      'ownerAssignment.identityId': identity.nexusIdentityId,
      'ownerAssignment.activatedAt': null,
    },
    { $set: { 'ownerAssignment.activatedAt': new Date() } },
  );

  const [roles, tenant] = await Promise.all([
    identityCollections.tenantUserRoles
      .find({ nexusIdentityId: identity.nexusIdentityId, tenantId: tenantMember.tenantId })
      .toArray(),
    tenantCollections.domainTenants.findOne(
      { tenantId: tenantMember.tenantId },
      { projection: { organizationName: 1 } },
    ),
  ]);
  const role = getPrimaryTenantRole(roles.map((record) => record.role));

  return {
    isTenant: true,
    isMember: false,
    mode: 'tenant',
    tenantId: tenantMember.tenantId,
    tenantName: tenant?.organizationName ?? null,
    memberId: null,
    role,
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
    const tenant = await collections.tenants.findOne(
      { _id: tenantMembership.tenantId },
      { projection: { organizationName: 1 } },
    );
    return {
      isTenant: true,
      isMember: false,
      mode: 'tenant',
      tenantId: tenantMembership.tenantId.toHexString(),
      tenantName: tenant?.organizationName ?? null,
      memberId: null,
      role: tenantMembership.role,
    };
  }

  const domainTenantContext = await getDomainTenantContextForUser(userId);
  if (domainTenantContext) return domainTenantContext;

  const member = await collections.members.findOne({ userId, status: 'active' });
  if (member) {
    return {
      isTenant: false,
      isMember: true,
      mode: 'regular_user',
      tenantId: null,
      tenantName: null,
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
      tenantName: null,
      memberId: null,
      role: null,
    };
  }

  return {
    isTenant: false,
    isMember: false,
    mode: 'needs_workspace_setup',
    tenantId: null,
    tenantName: null,
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
  if (context.isTenant && (context.role === 'admin' || context.role === 'owner')) {
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
  const domainIdentity = await syncDomainIdentityForLoginUser({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    provider: user.provider,
  });
  await Promise.all([
    syncOnboardingMemberEmail(user.id, user.email),
    syncLegacyTenantContextForDomain(user.id, domainIdentity.nexusIdentityId, status.context),
  ]);
  const domainAuthorization = await getDomainAuthorizationContext(domainIdentity.nexusIdentityId, status.context.tenantId);
  const context = applyDomainRoleToContext(status.context, getPrimaryTenantRole(domainAuthorization.roles));

  // Fetch plan + seat summary for tenant users so the dashboard can enforce
  // and display the plan tier and remaining non-member seats.
  let planSummary: TenantPlanSummary | undefined;
  if (context.isTenant && context.tenantId) {
    planSummary = await getTenantPlanSummary(context.tenantId).catch(() => undefined);
  }

  // Resolve catalog mode and member-purchase eligibility.
  // These require async DB lookups so they are computed here and merged into
  // the authorization object rather than inside the sync getDashboardAuthorization helper.
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);

  // Run all four tenant-scoped lookups in parallel to avoid serial latency on
  // every /api/me call. domainTenantStatus feeds resolveCatalogMode, which is
  // called after Promise.all resolves.
  const [domainTenantDoc, userRoles, domainMemberDoc, legacyOnboardingState] = await Promise.all([
    // Look up the domain tenant's live status (separate from the legacy onboarding tenant).
    context.tenantId
      ? tenantCollections.domainTenants.findOne(
          { tenantId: context.tenantId },
          { projection: { status: 1 } },
        )
      : Promise.resolve(null),
    // Check if this user holds the 'member' role in the tenant's role assignments.
    // Only members are allowed to purchase from the catalog.
    context.tenantId
      ? identityCollections.tenantUserRoles
          .find({ nexusIdentityId: domainIdentity.nexusIdentityId, tenantId: context.tenantId })
          .toArray()
      : Promise.resolve([]),
    // Fetch the domain TenantMember document to read the services field.
    // This document is authoritative for which services this specific member was
    // granted at invite time (e.g. ['benefits_catalog']). Defaults to
    // DEFAULT_MEMBER_SERVICES when the member doc has no services field (pre-Task-08
    // records) and to [] when the user has no domain tenant membership at all.
    context.tenantId && domainIdentity.nexusIdentityId
      ? tenantCollections.tenantMembers.findOne(
          { nexusIdentityId: domainIdentity.nexusIdentityId, tenantId: context.tenantId },
          { projection: { services: 1 } },
        )
      : Promise.resolve(null),
    // Post-onboarding welcome flag: lives on the user's legacy onboarding
    // state doc, set by createWorkspace, cleared only by the dev dismiss.
    getOnboardingCollections(db).onboardingStates.findOne(
      { userId },
      { projection: { welcomePending: 1 } },
    ),
  ]);

  const domainTenantStatus: string | null = domainTenantDoc?.status ?? null;
  const hasMemberRole = userRoles.some((r) => r.role === 'member');
  const memberServices: string[] =
    domainMemberDoc != null ? (domainMemberDoc.services ?? [...DEFAULT_MEMBER_SERVICES]) : [];

  // Business setup is complete when getOnboardingStatus() does not require it as the next
  // step. That function checks the legacy tenant.businessSetupStatus field which is the
  // authoritative source (the domain tenantOnboardingStates.state is set to 'build_mode'
  // immediately after workspace creation and cannot be used to detect incomplete setup).
  const businessSetupComplete = status.onboarding.step !== 'business_setup';

  const catalogMode = await resolveCatalogMode(
    context.tenantId ?? null,
    domainTenantStatus,
    tenantCollections,
  );

  const baseAuthorization = getDashboardAuthorization(user.email, context, domainAuthorization.permissions);

  // A NEXUS platform admin with no tenant/member has nothing to onboard: report a
  // terminal 'platform_admin' mode and clear onboarding so the dashboard lands them
  // on Home instead of the workspace-setup wizard. Admins who ARE tenant members
  // keep their normal 'tenant' mode.
  const noTenantAdmin = isNoTenantPlatformAdmin(baseAuthorization.isPlatformAdmin === true, context);
  const resolvedMode = noTenantAdmin ? ('platform_admin' as const) : context.mode;
  // welcomePending blocks tenant users only (never admins/members) - the
  // popup shows on every login until cleared.
  const welcomePending =
    !noTenantAdmin && context.isTenant && legacyOnboardingState?.welcomePending === true;
  const resolvedOnboarding = noTenantAdmin
    ? { required: false, step: null }
    : { ...status.onboarding, welcomePending };

  // Wallet RouterScreen payload - cards the user sees right after login.
  // Lives in its own helper so getMe does not grow further (file is already
  // at the size cap; new auth logic goes in services/auth/).
  const { computeWalletMeRouter } = await import('./auth/wallet-me-router.service');
  const walletRouter = await computeWalletMeRouter(db, {
    nexusIdentityId: domainIdentity.nexusIdentityId,
    email: user.email,
  });

  // Plan #3: wallet profile sub-doc so the LoginSheet can gate the
  // slide chain on completedAt.
  const { getWalletProfile } = await import('./wallet/wallet-profile.service');
  const walletProfile = await getWalletProfile(db, {
    prismaUserId: user.id,
    email: user.email,
  });

  // Surface the identity's phone (the canonical SMS-login store) so the wallet
  // can display it and let the user edit it. phoneVerifiedAt is null for a
  // test-attached number that never went through a real OTP.
  const phoneDoc = await identityCollections.nexusIdentities.findOne(
    { nexusIdentityId: domainIdentity.nexusIdentityId },
    { projection: { phone: 1, phoneVerifiedAt: 1, marketingConsent: 1 } },
  );

  // The tenant's logo + brand color for the dashboard header / branding UI
  // (logo null -> initials; color null -> wallet derives one from the id).
  const tenantBrandingDoc = context.tenantId
    ? await getTenantDomainCollections(db).domainTenants.findOne(
        { tenantId: context.tenantId },
        { projection: { logoUrl: 1, brandColor: 1, logoCrop: 1, businessSetupApproval: 1, autoApproveOffers: 1 } },
      )
    : null;

  return {
    user: { id: user.id, email: user.email, name: user.fullName, avatarUrl: user.avatarUrl ?? null },
    context: {
      ...context,
      mode: resolvedMode,
      tenantLogoUrl: tenantBrandingDoc?.logoUrl ?? null,
      tenantLogoCrop: tenantBrandingDoc?.logoCrop ?? null,
      tenantBrandColor: tenantBrandingDoc?.brandColor ?? null,
      ...(planSummary && {
        plan: planSummary.plan,
        seats: {
          used: planSummary.seatsUsed,
          limit: planSummary.seatLimit,
          remaining: planSummary.remainingSeats,
          isAtLimit: planSummary.isAtLimit,
        },
      }),
    },
    authorization: {
      ...baseAuthorization,
      catalogMode,
      catalogServiceActive: catalogMode !== 'inactive',
      canPurchaseCatalog: hasMemberRole && catalogMode !== 'inactive',
      memberServices,
      businessSetupComplete,
      // M8: NEXUS-admin approval state of this tenant's business setup.
      ...approvalAuthFields(tenantBrandingDoc?.businessSetupApproval ?? null),
      // Trusted/auto-approve tenant: its ecosystem offers publish immediately.
      offersAutoApproved: tenantBrandingDoc?.autoApproveOffers === true,
    },
    onboarding: resolvedOnboarding,
    memberships: walletRouter.memberships,
    isPlatformAdmin: walletRouter.isPlatformAdmin,
    canOpenDashboard: walletRouter.canOpenDashboard,
    defaultTenantId: walletRouter.defaultTenantId,
    router: walletRouter.router,
    profile: walletProfile,
    phone: phoneDoc?.phone ?? null,
    phoneVerifiedAt: phoneDoc?.phoneVerifiedAt ? phoneDoc.phoneVerifiedAt.toISOString() : null,
    marketingConsent: phoneDoc?.marketingConsent?.granted ?? false,
  };
}

/**
 * Mirrors current legacy tenant context into the domain tenant model.
 * Input: Prisma user id, synced domain identity id, and current dashboard context.
 * Output: domain tenant/member/role records exist when the user is a tenant member.
 */
async function syncLegacyTenantContextForDomain(
  userId: string,
  nexusIdentityId: string,
  context: UserContext,
): Promise<void> {
  if (!context.isTenant || !context.tenantId) return;

  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const tenantId = new ObjectId(context.tenantId);
  const [tenant, tenantMembership] = await Promise.all([
    collections.tenants.findOne({ _id: tenantId }),
    collections.tenantMembers.findOne({ tenantId, userId }),
  ]);

  if (!tenant || !tenantMembership?._id) return;
  await syncDomainTenantMembership({
    tenantId,
    tenant,
    tenantMembershipId: tenantMembership._id,
    tenantMembership,
    nexusIdentityId,
  });
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

  // Israeli phones must be OTP-verified (server-side proof written by
  // /api/v1/onboarding/phone-otp/verify); Israeli-prefixed junk is rejected.
  // Foreign numbers pass without verification. The wizard mirrors this; the
  // backend is the real boundary.
  const phoneClass = classifyOnboardingPhone(input.contactPhone);
  if (phoneClass.kind === 'invalid_israeli') throw createError('invalid_israeli_phone', 400);
  if (phoneClass.kind === 'israeli') {
    const verified = await hasVerifiedOnboardingPhone(db, userId, phoneClass.normalized);
    if (!verified) throw createError('phone_not_verified', 400);
  }

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
  const domainIdentity = await syncDomainIdentityForLoginUser({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    provider: user.provider,
  });
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
  const membershipInsert = await collections.tenantMembers.insertOne(membership);
  await syncDomainTenantMembership({
    tenantId: tenantInsert.insertedId,
    tenant: { ...tenant, _id: tenantInsert.insertedId },
    tenantMembershipId: membershipInsert.insertedId,
    tenantMembership: { ...membership, _id: membershipInsert.insertedId },
    nexusIdentityId: domainIdentity.nexusIdentityId,
    isWorkspaceCreator: true,
  });

  await collections.onboardingStates.updateOne(
    { userId },
    {
      $setOnInsert: { createdAt: now },
      $set: {
        userId,
        state: 'business_setup_required',
        skippedWorkspaceSetup: false,
        tenantId: tenantInsert.insertedId,
        // The welcome popup blocks the dashboard on every login until a rep
        // flow clears it (dev-only dismiss endpoint for local testing).
        welcomePending: true,
        updatedAt: now,
      },
      $unset: { skipReason: '', memberId: '' },
    },
    { upsert: true },
  );

  // Monday.com Website Leads item - fire-and-forget (the service never
  // throws); runs in dev + prod for now (dev skip is a planned follow-up).
  void createOnboardingLead({
    fullName: (user.fullName ?? '').trim() || user.email,
    contactRole: input.contactRole,
    organizationName: input.organizationName,
    website: input.website,
    phone: input.contactPhone,
    tenantId: tenantInsert.insertedId.toHexString(),
  });

  // Verification is single-use: drop it now that the workspace exists.
  if (phoneClass.kind === 'israeli') {
    await consumeVerifiedOnboardingPhone(db, userId, phoneClass.normalized).catch((e) => {
      console.warn('[onboarding] failed to consume phone verification (non-fatal):', e);
    });
  }

  return {
    success: true,
    userType: 'tenant' as const,
    tenantId: tenantInsert.insertedId.toHexString(),
    nextStep: 'business_setup' as const,
    redirectTo: '/dashboard',
  };
}

/**
 * DEV-ONLY: clears the post-onboarding welcome flag so the dashboard opens
 * normally again. Production has no dismiss path (the route 404s there).
 * Input: Prisma user id. Output: flag cleared (no-op when no state doc).
 */
export async function dismissPostOnboardingWelcome(userId: string): Promise<void> {
  const db = await getMongoDb();
  await getOnboardingCollections(db).onboardingStates.updateOne(
    { userId },
    { $set: { welcomePending: false, updatedAt: new Date() } },
  );
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
 * Requires a tenant context plus a domain permission derived from backend state.
 * Input: Prisma user id and required permission.
 * Output: tenant ObjectId when the user's domain role grants the permission.
 */
async function requireTenantPermission(userId: string, permission: DomainPermission): Promise<ObjectId> {
  const user = await getPrismaUser(userId);
  const context = await getUserContext(userId);
  if (!context.isTenant || !context.tenantId) throw createError('Tenant access required', 403);

  const domainIdentity = await syncDomainIdentityForLoginUser({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    provider: user.provider,
  });
  await syncLegacyTenantContextForDomain(user.id, domainIdentity.nexusIdentityId, context);

  const authorization = await getDomainAuthorizationContext(domainIdentity.nexusIdentityId, context.tenantId);
  if (!hasDomainPermission(authorization, permission)) throw createError('Forbidden', 403);

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
  return upsertBusinessSetup(userId, data, 'draft', 'workspace.trigger_go_live');
}

/**
 * Submits a tenant business setup for review.
 * Input: Prisma user id and validated setup fields.
 * Output: submitted setup response.
 */
export async function submitBusinessSetup(userId: string, data: BusinessSetupInput) {
  return upsertBusinessSetup(userId, data, 'submitted', 'workspace.trigger_go_live');
}

/**
 * DEV-ONLY: submit a business-setup approval request WITHOUT completing the full
 * form, so the global-upload / Go-Live gates can be exercised in development. Marks
 * the legacy business setup 'submitted' (so onboarding no longer routes to the
 * wizard) and the domain approval 'pending' + devMode:true, then notifies admins.
 * The ROUTE hard-disables this in production; this function must never run there.
 * Input: Prisma user id. Output: void.
 */
export async function submitDevBusinessSetupRequest(userId: string): Promise<void> {
  const tenantId = await requireTenantPermission(userId, 'workspace.trigger_go_live');
  const db = await getMongoDb();
  const now = new Date();
  await getOnboardingCollections(db).tenants.updateOne(
    { _id: tenantId },
    { $set: { businessSetupStatus: 'submitted', updatedAt: now } },
  );
  const tc = getTenantDomainCollections(db);
  await tc.domainTenants.updateOne(
    { tenantId: tenantId.toHexString() },
    { $set: { businessSetupApproval: { status: 'pending', devMode: true, submittedAt: now }, updatedAt: now } },
  );
  const t = await tc.domainTenants.findOne({ tenantId: tenantId.toHexString() }, { projection: { organizationName: 1 } });
  void sendBusinessSetupSubmittedToAdmins(t?.organizationName ?? tenantId.toHexString(), true);
}

/**
 * Upserts business setup data and mirrors status onto the tenant document.
 * Input: Prisma user id, validated setup data, and desired status.
 * Output: saved setup response.
 */
async function upsertBusinessSetup(
  userId: string,
  data: BusinessSetupInput,
  status: BusinessSetupDocument['status'],
  permission: DomainPermission,
) {
  const tenantId = await requireTenantPermission(userId, permission);
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

  // On SUBMIT, put the tenant into the NEXUS-admin approval queue (M8). Domain
  // tenantId === the legacy tenant _id hex. Re-submitting after edits resets to
  // 'pending', clearing any prior reason/review + the devMode flag.
  if (status === 'submitted') {
    const tc = getTenantDomainCollections(db);
    await tc.domainTenants.updateOne(
      { tenantId: tenantId.toHexString() },
      { $set: { businessSetupApproval: nextApprovalOnSubmit(now), updatedAt: now } },
    );
    // Notify NEXUS admins that a tenant is awaiting business-setup approval.
    const t = await tc.domainTenants.findOne({ tenantId: tenantId.toHexString() }, { projection: { organizationName: 1 } });
    void sendBusinessSetupSubmittedToAdmins(t?.organizationName ?? tenantId.toHexString(), false);
  }

  return getBusinessSetup(userId);
}

// ── Wizard draft persistence ────────────────────────────────────────────────

export interface WizardDraftInput {
  step?: number;
  orgName?: string;
  website?: string;
  businessDesc?: string;
  primarySelected?: string[];
  primarySuggested?: string[];
  phone?: string;
  role?: string;
}

/**
 * Saves wizard progress to the user's onboardingState document in MongoDB.
 * Called during "complete later" skip or periodically while the wizard is open.
 * Input: Prisma user id and current wizard field values.
 * Output: resolves when the draft is persisted.
 */
export async function saveWizardDraft(userId: string, draft: WizardDraftInput): Promise<void> {
  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const now = new Date();
  await collections.onboardingStates.updateOne(
    { userId },
    {
      $setOnInsert: { createdAt: now },
      $set: {
        userId,
        wizardDraft: { ...draft, savedAt: now },
        updatedAt: now,
      },
    },
    { upsert: true },
  );
}

/**
 * Loads the saved wizard draft for the authenticated user.
 * Input: Prisma user id.
 * Output: saved draft or null when none exists.
 */
export async function loadWizardDraft(userId: string): Promise<WizardDraftInput | null> {
  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const doc = await collections.onboardingStates.findOne(
    { userId },
    { projection: { wizardDraft: 1 } },
  );
  if (!doc?.wizardDraft) return null;
  const { savedAt: _savedAt, ...fields } = doc.wizardDraft;
  return fields;
}

/**
 * Clears the wizard draft after successful workspace creation.
 * Input: Prisma user id.
 * Output: resolves when the draft field is removed.
 */
export async function clearWizardDraft(userId: string): Promise<void> {
  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  await collections.onboardingStates.updateOne(
    { userId },
    { $unset: { wizardDraft: '' }, $set: { updatedAt: new Date() } },
  );
}

/**
 * Triggers the Go Live transition for a tenant's catalog service.
 * Transitions Tenant.status from build_mode to 'active' and
 * TenantOnboardingState.state to 'active', making the catalog visible
 * to purchasing members.
 *
 * Precondition: the tenant's onboarding state must be one of
 * 'build_mode', 'wizard_completed', or 'go_live_pending' to ensure
 * business setup is sufficiently complete before going live.
 *
 * Input:  tenantId - the domain tenant identifier string.
 * Output: resolves when both domain records are updated.
 * Throws: Error (status 400) when business setup is not in a ready state.
 */
export async function triggerGoLive(tenantId: string): Promise<void> {
  const db = await getMongoDb();
  const collections = getTenantDomainCollections(db);

  const onboardingState = await collections.tenantOnboardingStates.findOne({ tenantId });
  const readyStates: string[] = ['build_mode', 'wizard_completed', 'go_live_pending'];

  if (!onboardingState || !readyStates.includes(onboardingState.state)) {
    throw Object.assign(
      new Error('Business setup must be completed before going live'),
      { status: 400 },
    );
  }

  const now = new Date();

  // Update both domain records atomically from the backend's perspective.
  // The Tenant status drives catalogMode resolution in getMe(); the onboarding
  // state drives wizard/setup gating on the dashboard.
  await collections.domainTenants.updateOne(
    { tenantId },
    { $set: { status: 'active' as const, updatedAt: now } },
  );
  await collections.tenantOnboardingStates.updateOne(
    { tenantId },
    { $set: { state: 'active' as const, updatedAt: now } },
  );
}
