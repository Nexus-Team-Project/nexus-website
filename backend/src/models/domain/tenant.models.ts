/**
 * Defines tenant, member, group, and service activation documents for NEXUS.
 * These models prepare MongoDB to own tenant administration and member roles.
 */
import type { Collection, Db, ObjectId } from 'mongodb';
import { z } from 'zod';
import { DOMAIN_COLLECTIONS } from './collections';

/**
 * Default services granted to new members when no explicit services list is provided.
 * Used as the fallback in TenantMember and TenantMemberInvitation schemas and
 * as the runtime default when reading pre-Task-08 member documents.
 */
export const DEFAULT_MEMBER_SERVICES = ['benefits_catalog'] as const;

export const TENANT_CONTACT_STATUSES = ['active', 'inactive', 'pending', 'expired'] as const;
export type TenantContactStatus = typeof TENANT_CONTACT_STATUSES[number];

export const TENANT_PLANS = ['basic', 'advanced', 'premium'] as const;
export type TenantPlan = typeof TENANT_PLANS[number];

/** Seat limits per billing plan for non-member roles. */
export const PLAN_SEAT_LIMITS: Record<TenantPlan, number> = {
  basic: 3,
  advanced: 5,
  premium: 10,
};

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
export const CATALOG_ADOPTION_MODES = ['auto_silent', 'auto_notify', 'manual'] as const;
export const DEFAULT_PRICING_RULES = ['inherit_selection', 'manual_required'] as const;
export const TENANT_MEMBER_INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked'] as const;

export type TenantDomainStatus = typeof TENANT_STATUSES[number];
export type TenantOnboardingState = typeof TENANT_ONBOARDING_STATES[number];
export type TenantMemberStatus = typeof TENANT_MEMBER_STATUSES[number];
export type TenantServiceKey = typeof SERVICE_KEYS[number];
export type TenantServiceActivationStatus = typeof SERVICE_ACTIVATION_STATUSES[number];
export type MemberGroupType = typeof MEMBER_GROUP_TYPES[number];
export type CatalogAdoptionMode = typeof CATALOG_ADOPTION_MODES[number];
export type DefaultPricingRule = typeof DEFAULT_PRICING_RULES[number];
export type TenantMemberInvitationStatus = typeof TENANT_MEMBER_INVITATION_STATUSES[number];

/**
 * Normalized crop of the tenant logo relative to the PRISTINE original (fractions
 * 0..1). Applied at display time (Cloudinary transform), so the crop can be changed
 * or reverted (cleared) without re-uploading the image. Mirrors the offer imageCrop shape.
 */
export const logoCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
  aspect: z.number().positive().optional(),
  naturalWidth: z.number().positive().optional(),
  naturalHeight: z.number().positive().optional(),
});
export type LogoCrop = z.infer<typeof logoCropSchema>;

export const domainTenantSchema = z.object({
  tenantId: z.string().min(1),
  organizationName: z.string().min(1).max(255),
  // Cloudinary URL of the organization logo (the PRISTINE original). Absent -> the
  // UI shows the tenant-name initials (only the Nexus ecosystem catalog uses Nexus logo).
  logoUrl: z.string().url().optional(),
  // Crop of the logo (normalized fractions), applied at display time. Absent/null =
  // show the full logo. Lets the crop be adjusted or reverted without re-upload.
  logoCrop: logoCropSchema.nullable().optional(),
  // Organization brand color as a 6-digit hex (e.g. "#635bff"). This is the
  // accent color wallet members see the first time they sign in to this
  // tenant's benefits. Absent -> the wallet derives a deterministic color from
  // the tenantId so every tenant still looks distinct.
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  status: z.enum(TENANT_STATUSES),
  // Billing plan that controls how many non-member seats this tenant has.
  // Defaults to 'basic'. Updated manually in MongoDB until PayMe billing lands.
  plan: z.enum(TENANT_PLANS).default('basic'),
  createdByIdentityId: z.string().min(1),
  goLiveCompletedAt: z.date().optional(),
  /**
   * When true (the default), wallet join requests for this tenant are accepted
   * automatically - the requester becomes a member immediately with no admin
   * action. When false, requests stay pending for manual approve/deny from the
   * dashboard. Absent on tenants created before this field = treated as true.
   */
  autoAcceptJoinRequests: z.boolean().default(true),
  /**
   * When true, this tenant is TRUSTED: its global (ecosystem) offer create/edit
   * skips platform-admin approval and goes straight to 'active'. Default false.
   * Absent on tenants created before this field = treated as false (not trusted).
   */
  autoApproveOffers: z.boolean().default(false),
  /**
   * NEXUS-admin approval of this tenant's business setup (Phase 2 M8). Absent =
   * never submitted. Set to 'pending' when business setup is submitted (or via
   * the dev-only shortcut, which also sets devMode:true); a platform admin moves
   * it to 'approved' or 'denied' (denied carries a free-text reason). Production
   * global-offer publish + Go Live require status 'approved'.
   */
  businessSetupApproval: z.object({
    status: z.enum(['pending', 'approved', 'denied']),
    reason: z.string().max(1000).optional(),
    devMode: z.boolean().optional(),
    submittedAt: z.date().optional(),
    reviewedByEmail: z.string().optional(),
    reviewedAt: z.date().optional(),
  }).optional(),
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
  /**
   * Services this member was granted access to at invite time.
   * Defaults to DEFAULT_MEMBER_SERVICES for backwards compatibility with pre-Task-08 records.
   */
  services: z.array(z.string()).default([...DEFAULT_MEMBER_SERVICES]),
  // Optional canonical Israeli mobile ("05XXXXXXXX"). Set from the invite
  // payload at invite time so it is already present when the invitee accepts.
  phone: z.string().regex(/^05\d{8}$/).optional(),
  // True only when the member verified the number themselves (SMS / wallet OTP).
  phoneVerified: z.boolean().optional(),
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

export const tenantMemberInvitationSchema = z.object({
  tenantMemberInvitationId: z.string().min(1),
  tenantId: z.string().min(1),
  tenantMemberId: z.string().min(1),
  nexusIdentityId: z.string().min(1),
  invitedEmail: z.string().email(),
  normalizedEmail: z.string().email(),
  roles: z.array(z.string().min(1).max(100)).min(1),
  groupIds: z.array(z.string().min(1)).default([]),
  /**
   * Services explicitly granted when this invitation was created.
   * Used to determine which features the member can access after accepting.
   * Defaults to DEFAULT_MEMBER_SERVICES for backwards compatibility.
   */
  services: z.array(z.string()).default([...DEFAULT_MEMBER_SERVICES]),
  // Optional canonical Israeli mobile ("05XXXXXXXX") captured at invite time.
  // Forwarded onto the tenant member and contact documents.
  phone: z.string().regex(/^05\d{8}$/).optional(),
  tokenHash: z.string().min(64).max(64),
  status: z.enum(TENANT_MEMBER_INVITATION_STATUSES),
  invitedByIdentityId: z.string().min(1),
  acceptedByIdentityId: z.string().min(1).optional(),
  emailMessageId: z.string().min(1).optional(),
  lastEmailSentAt: z.date().optional(),
  expiresAt: z.date(),
  acceptedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Tenant-owned contact record — does not require Nexus registration or invite acceptance. */
export const tenantContactSchema = z.object({
  tenantContactId: z.string().min(1),
  tenantId: z.string().min(1),
  email: z.string().email(),
  normalizedEmail: z.string().email(),
  displayName: z.string().min(1).max(255),
  status: z.enum(TENANT_CONTACT_STATUSES),
  address: z.string().max(500).optional(),
  // Canonical Israeli mobile number "05XXXXXXXX". Always stored in the local
  // 10-digit form; the API layer accepts +972 input and normalizes before save.
  phone: z.string().regex(/^05\d{8}$/).optional(),
  // True only when the member verified this number themselves (SMS / wallet OTP).
  // Tenant-entered or test-attached numbers are false.
  phoneVerified: z.boolean().optional(),
  lastActivityAt: z.date().optional(),
  nexusIdentityId: z.string().optional(),
  // User-defined custom column values, keyed by the server-generated fieldId
  // ("cf_<id>") of a tenantContactFields definition - never by the user's
  // free-text column name. This is the core NoSQL-injection guard.
  customFields: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Value types a tenant admin can give a custom contact column. */
export const CONTACT_FIELD_TYPES = [
  'free_text',
  'number',
  'date',
  'single_label',
  'multi_label',
  'location',
] as const;
export type ContactFieldType = typeof CONTACT_FIELD_TYPES[number];

/**
 * A tenant-defined custom column on the contacts table. One document per column.
 * `fieldId` is server-generated ("cf_<id>"); `options` is required only for the
 * label types. `order` drives display order in the table and filter panel.
 */
export const tenantContactFieldSchema = z.object({
  fieldId: z.string().regex(/^cf_[a-z0-9]{8,}$/),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(50),
  type: z.enum(CONTACT_FIELD_TYPES),
  // Allowed values for single_label / multi_label columns; absent otherwise.
  options: z.array(z.string().min(1).max(40)).max(30).optional(),
  order: z.number().int().nonnegative(),
  // 'manual' (default) for admin-created columns; 'wallet_profile' for read-only
  // mirror columns synced from a member's wallet onboarding answers.
  origin: z.enum(['manual', 'wallet_profile']).optional(),
  // Stable mirror-field key (e.g. 'gender') when origin === 'wallet_profile'.
  sourceFieldKey: z.string().min(1).max(40).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const tenantCatalogPolicySchema = z.object({
  tenantCatalogPolicyId: z.string().min(1),
  tenantId: z.string().min(1),
  catalogAdoptionMode: z.enum(CATALOG_ADOPTION_MODES),
  defaultPricingRule: z.enum(DEFAULT_PRICING_RULES),
  autoExclusionMaxPrice: z.number().nonnegative().optional(),
  pendingReviewTimeoutDays: z.number().int().min(7).default(30),
  notificationRoles: z.array(z.string().min(1)).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DomainTenantDocument = z.infer<typeof domainTenantSchema> & { _id?: ObjectId };
export type TenantOnboardingStateDocument = z.infer<typeof tenantOnboardingStateSchema> & { _id?: ObjectId };
export type TenantProfileDocument = z.infer<typeof tenantProfileSchema> & { _id?: ObjectId };
export type TenantServiceActivationDocument = z.infer<typeof tenantServiceActivationSchema> & { _id?: ObjectId };
export type TenantMemberDomainDocument = z.infer<typeof tenantMemberDomainSchema> & { _id?: ObjectId };
export type MemberGroupDocument = z.infer<typeof memberGroupSchema> & { _id?: ObjectId };
export type MemberGroupAssignmentDocument = z.infer<typeof memberGroupAssignmentSchema> & { _id?: ObjectId };
export type TenantMemberInvitationDocument = z.infer<typeof tenantMemberInvitationSchema> & { _id?: ObjectId };
export type TenantContactDocument = z.infer<typeof tenantContactSchema> & { _id?: ObjectId };
export type TenantContactFieldDocument = z.infer<typeof tenantContactFieldSchema> & { _id?: ObjectId };
export type TenantCatalogPolicyDocument = z.infer<typeof tenantCatalogPolicySchema> & { _id?: ObjectId };

export interface TenantDomainCollections {
  domainTenants: Collection<DomainTenantDocument>;
  tenantOnboardingStates: Collection<TenantOnboardingStateDocument>;
  tenantProfiles: Collection<TenantProfileDocument>;
  tenantServiceActivations: Collection<TenantServiceActivationDocument>;
  tenantMembers: Collection<TenantMemberDomainDocument>;
  tenantMemberInvitations: Collection<TenantMemberInvitationDocument>;
  memberGroups: Collection<MemberGroupDocument>;
  memberGroupAssignments: Collection<MemberGroupAssignmentDocument>;
  tenantCatalogPolicies: Collection<TenantCatalogPolicyDocument>;
  tenantContacts: Collection<TenantContactDocument>;
  tenantContactFields: Collection<TenantContactFieldDocument>;
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
    tenantMemberInvitations: db.collection<TenantMemberInvitationDocument>(
      DOMAIN_COLLECTIONS.tenantMemberInvitations,
    ),
    memberGroups: db.collection<MemberGroupDocument>(DOMAIN_COLLECTIONS.memberGroups),
    memberGroupAssignments: db.collection<MemberGroupAssignmentDocument>(DOMAIN_COLLECTIONS.memberGroupAssignments),
    tenantCatalogPolicies: db.collection<TenantCatalogPolicyDocument>(DOMAIN_COLLECTIONS.tenantCatalogPolicies),
    tenantContacts: db.collection<TenantContactDocument>(DOMAIN_COLLECTIONS.tenantContacts),
    tenantContactFields: db.collection<TenantContactFieldDocument>(DOMAIN_COLLECTIONS.tenantContactFields),
  };
}
