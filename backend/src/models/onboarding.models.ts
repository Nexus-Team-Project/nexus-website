/**
 * Defines MongoDB collection names, document interfaces, and indexes for
 * tenant/member onboarding data owned by the Nexus product backend.
 */
import { Collection, Db, ObjectId } from 'mongodb';

export const TENANTS_COLLECTION = 'tenants';
export const TENANT_MEMBERS_COLLECTION = 'tenantMembers';
export const MEMBERS_COLLECTION = 'members';
export const ONBOARDING_STATES_COLLECTION = 'onboardingStates';
export const BUSINESS_SETUPS_COLLECTION = 'businessSetups';

export const USE_CASES = [
  'benefits_club',
  'digital_wallet',
  'vouchers',
  'employee_gifts',
  'loyalty',
  'prepaid_card',
  'payment',
  'not_sure',
] as const;

export const CONTACT_ROLES = [
  'owner',
  'ceo',
  'finance',
  'operations',
  'marketing',
  'product',
  'developer',
  'other',
] as const;

export const TENANT_ROLES = [
  'admin',
  'finance',
  'operator',
  'analyst',
  'developer',
  'support',
  'supply_manager',
  'member',
] as const;

export type UseCase = typeof USE_CASES[number];
export type ContactRole = typeof CONTACT_ROLES[number];
export type TenantRole = typeof TENANT_ROLES[number];
export type TenantStatus = 'onboarding' | 'active' | 'suspended';
export type BusinessSetupStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
export type MemberStatus = 'active' | 'pending' | 'suspended' | 'deactivated';
export type SkipReason = 'regular_user' | 'complete_later';
export type OnboardingStateName =
  | 'needs_workspace_setup'
  | 'workspace_setup_deferred'
  | 'tenant_created'
  | 'member_created'
  | 'business_setup_required'
  | 'complete';

export interface TenantDocument {
  _id?: ObjectId;
  organizationName: string;
  website: string;
  businessDescription: string;
  selectedUseCases: UseCase[];
  contactPhone: string;
  contactRole: ContactRole;
  createdByUserId: string;
  status: TenantStatus;
  businessSetupStatus: BusinessSetupStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantMemberDocument {
  _id?: ObjectId;
  tenantId: ObjectId;
  userId: string;
  role: TenantRole;
  status: MemberStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberDocument {
  _id?: ObjectId;
  userId: string;
  status: MemberStatus;
  onboardingSource: 'skipped_workspace_setup' | 'invited' | 'self_registration';
  createdAt: Date;
  updatedAt: Date;
}

export interface OnboardingStateDocument {
  _id?: ObjectId;
  userId: string;
  state: OnboardingStateName;
  skippedWorkspaceSetup: boolean;
  skipReason?: SkipReason;
  tenantId?: ObjectId;
  memberId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessSetupDocument {
  _id?: ObjectId;
  tenantId: ObjectId;
  data: Record<string, unknown>;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
}

export interface OnboardingCollections {
  tenants: Collection<TenantDocument>;
  tenantMembers: Collection<TenantMemberDocument>;
  members: Collection<MemberDocument>;
  onboardingStates: Collection<OnboardingStateDocument>;
  businessSetups: Collection<BusinessSetupDocument>;
}

/**
 * Returns typed MongoDB collections for onboarding data.
 * Input: Mongo database handle.
 * Output: collection map used by onboarding services.
 */
export function getOnboardingCollections(db: Db): OnboardingCollections {
  return {
    tenants: db.collection<TenantDocument>(TENANTS_COLLECTION),
    tenantMembers: db.collection<TenantMemberDocument>(TENANT_MEMBERS_COLLECTION),
    members: db.collection<MemberDocument>(MEMBERS_COLLECTION),
    onboardingStates: db.collection<OnboardingStateDocument>(ONBOARDING_STATES_COLLECTION),
    businessSetups: db.collection<BusinessSetupDocument>(BUSINESS_SETUPS_COLLECTION),
  };
}

/**
 * Creates MongoDB indexes that enforce onboarding uniqueness rules.
 * Input: Mongo database handle.
 * Output: required indexes exist before API traffic is served.
 */
export async function ensureOnboardingIndexes(db: Db): Promise<void> {
  const collections = getOnboardingCollections(db);

  await Promise.all([
    collections.tenants.createIndex({ createdByUserId: 1 }),
    collections.tenantMembers.createIndex({ userId: 1, status: 1 }),
    collections.tenantMembers.createIndex({ tenantId: 1, userId: 1 }, { unique: true }),
    collections.members.createIndex({ userId: 1 }, { unique: true }),
    collections.onboardingStates.createIndex({ userId: 1 }, { unique: true }),
    collections.businessSetups.createIndex({ tenantId: 1 }, { unique: true }),
  ]);
}
