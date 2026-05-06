/**
 * Defines tenant, member, group, and service activation documents for NEXUS.
 * These models prepare MongoDB to own tenant administration and member roles.
 */
import type { Collection, Db, ObjectId } from 'mongodb';
import { z } from 'zod';
import { DOMAIN_COLLECTIONS } from './collections';

export const TENANT_STATUSES = ['build_mode', 'active', 'suspended', 'archived'] as const;
export const TENANT_ONBOARDING_STATES = [
  'onboarding_initiated',
  'wizard_in_progress',
  'wizard_completed',
  'wizard_skipped',
  'build_mode',
  'go_live_pending',
  'active',
  'suspended',
] as const;
export const TENANT_MEMBER_STATUSES = ['active', 'suspended', 'deactivated', 'pending_approval'] as const;
export const SERVICE_KEYS = ['benefits_catalog', 'provider_service', 'digital_wallet', 'business_payments'] as const;
export const SERVICE_ACTIVATION_STATUSES = ['inactive', 'pending_review', 'active', 'suspended'] as const;
export const MEMBER_GROUP_TYPES = ['static', 'dynamic'] as const;

export type TenantDomainStatus = typeof TENANT_STATUSES[number];
export type TenantOnboardingState = typeof TENANT_ONBOARDING_STATES[number];
export type TenantMemberStatus = typeof TENANT_MEMBER_STATUSES[number];
export type TenantServiceKey = typeof SERVICE_KEYS[number];
export type TenantServiceActivationStatus = typeof SERVICE_ACTIVATION_STATUSES[number];
export type MemberGroupType = typeof MEMBER_GROUP_TYPES[number];

export const domainTenantSchema = z.object({
  tenantId: z.string().min(1),
  organizationName: z.string().min(1).max(255),
  status: z.enum(TENANT_STATUSES),
  createdByIdentityId: z.string().min(1),
  goLiveCompletedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const tenantOnboardingStateSchema = z.object({
  tenantOnboardingStateId: z.string().min(1),
  tenantId: z.string().min(1),
  state: z.enum(TENANT_ONBOARDING_STATES),
  lastCompletedStep: z.string().max(100).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const tenantProfileSchema = z.object({
  tenantProfileId: z.string().min(1),
  tenantId: z.string().min(1),
  website: z.string().url().optional(),
  businessDescription: z.string().max(2000).optional(),
  selectedUseCases: z.array(z.string().min(1)).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const tenantServiceActivationSchema = z.object({
  tenantServiceActivationId: z.string().min(1),
  tenantId: z.string().min(1),
  serviceKey: z.enum(SERVICE_KEYS),
  status: z.enum(SERVICE_ACTIVATION_STATUSES),
  activatedByIdentityId: z.string().min(1).optional(),
  activatedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const tenantMemberDomainSchema = z.object({
  tenantMemberId: z.string().min(1),
  tenantId: z.string().min(1),
  nexusIdentityId: z.string().min(1),
  status: z.enum(TENANT_MEMBER_STATUSES),
  employeeId: z.string().max(100).optional(),
  employmentStartDate: z.date().optional(),
  requireAdminApproval: z.boolean().default(false),
  customFields: z.record(z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const memberGroupSchema = z.object({
  memberGroupId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(255),
  groupType: z.enum(MEMBER_GROUP_TYPES),
  dynamicRule: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const memberGroupAssignmentSchema = z.object({
  memberGroupAssignmentId: z.string().min(1),
  tenantId: z.string().min(1),
  memberGroupId: z.string().min(1),
  tenantMemberId: z.string().min(1),
  createdAt: z.date(),
});

export type DomainTenantDocument = z.infer<typeof domainTenantSchema> & { _id?: ObjectId };
export type TenantOnboardingStateDocument = z.infer<typeof tenantOnboardingStateSchema> & { _id?: ObjectId };
export type TenantProfileDocument = z.infer<typeof tenantProfileSchema> & { _id?: ObjectId };
export type TenantServiceActivationDocument = z.infer<typeof tenantServiceActivationSchema> & { _id?: ObjectId };
export type TenantMemberDomainDocument = z.infer<typeof tenantMemberDomainSchema> & { _id?: ObjectId };
export type MemberGroupDocument = z.infer<typeof memberGroupSchema> & { _id?: ObjectId };
export type MemberGroupAssignmentDocument = z.infer<typeof memberGroupAssignmentSchema> & { _id?: ObjectId };

export interface TenantDomainCollections {
  domainTenants: Collection<DomainTenantDocument>;
  tenantOnboardingStates: Collection<TenantOnboardingStateDocument>;
  tenantProfiles: Collection<TenantProfileDocument>;
  tenantServiceActivations: Collection<TenantServiceActivationDocument>;
  tenantMembers: Collection<TenantMemberDomainDocument>;
  memberGroups: Collection<MemberGroupDocument>;
  memberGroupAssignments: Collection<MemberGroupAssignmentDocument>;
}

/**
 * Returns typed MongoDB collections for tenant and member domain data.
 * Input: Mongo database handle.
 * Output: collection map used by future tenant and member services.
 */
export function getTenantDomainCollections(db: Db): TenantDomainCollections {
  return {
    domainTenants: db.collection<DomainTenantDocument>(DOMAIN_COLLECTIONS.domainTenants),
    tenantOnboardingStates: db.collection<TenantOnboardingStateDocument>(DOMAIN_COLLECTIONS.tenantOnboardingStates),
    tenantProfiles: db.collection<TenantProfileDocument>(DOMAIN_COLLECTIONS.tenantProfiles),
    tenantServiceActivations: db.collection<TenantServiceActivationDocument>(DOMAIN_COLLECTIONS.tenantServiceActivations),
    tenantMembers: db.collection<TenantMemberDomainDocument>(DOMAIN_COLLECTIONS.tenantMembers),
    memberGroups: db.collection<MemberGroupDocument>(DOMAIN_COLLECTIONS.memberGroups),
    memberGroupAssignments: db.collection<MemberGroupAssignmentDocument>(DOMAIN_COLLECTIONS.memberGroupAssignments),
  };
}
