/**
 * Defines identity, contact, role, and permission documents for NEXUS.
 * Prisma User remains login compatibility; these Mongo documents own domain identity.
 */
import type { Collection, Db, ObjectId } from 'mongodb';
import { z } from 'zod';
import { DOMAIN_COLLECTIONS } from './collections';

export const AUTH_PROVIDERS = ['email_passwordless', 'google', 'apple', 'email_password'] as const;
export const IDENTITY_STATUSES = ['invited', 'active', 'suspended', 'deactivated'] as const;
export const CONTACT_CHANNELS = ['email', 'sms', 'whatsapp', 'push', 'meta'] as const;
export const CONTACT_STATUSES = ['active', 'disabled', 'bounced', 'unsubscribed'] as const;
export const TENANT_ROLE_NAMES = [
  // Tenant-side roles
  'owner',               // workspace creator - unique per workspace, assigned at creation only
  'admin',
  'back_office_manager', // renamed from 'operator'
  'hr_manager',
  'finance',
  'billing_manager',
  'payments_manager',
  'support_agent',
  'developer',
  'supply_manager',
  'member',
  // Deprecated tenant roles - kept for backward compat, hidden from invite UI
  'operator',            // migrated to back_office_manager - do not use for new assignments
  'analyst',             // replaced by finance + viewer modifier (Phase 2) - do not use for new assignments
  // Platform-side roles
  'platform_admin',
  'platform_operator',
  'platform_back_office',
  'platform_marketing',
  'platform_commerce',
  'platform_support',
  'platform_finance',
] as const;

export type AuthProvider = typeof AUTH_PROVIDERS[number];
export type IdentityStatus = typeof IDENTITY_STATUSES[number];
export type ContactChannel = typeof CONTACT_CHANNELS[number];
export type ContactStatus = typeof CONTACT_STATUSES[number];
export type TenantUserRoleName = typeof TENANT_ROLE_NAMES[number];

/**
 * Marketing consent record on NexusIdentity, captured at signup or
 * settings change. Audit trail: granted flag + timestamps + source +
 * ip. Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.1
 */
export const marketingConsentSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.date(),
  updatedAt: z.date(),
  source: z.enum(['wallet_signup', 'wallet_settings']),
  ipAtGrant: z.string().min(1).max(64).optional(),
});

/**
 * Wallet onboarding profile. Collected via the wallet's registration
 * slide chain (Plan #3) and flushed in one PATCH at
 * RegistrationCompletePage. completedAt gates whether the slide chain
 * is re-shown to returning users (set => skip, route to RouterScreen).
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.1
 */
export const walletProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  birthday: z.date().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  lifeStage: z.string().min(1).max(100).optional(),
  motivation: z.string().min(1).max(200).optional(),
  purpose: z.array(z.string().min(1).max(100)).max(20).optional(),
  inviteFriendsSent: z.number().int().min(0).optional(),
  completedAt: z.date().optional(),
  updatedAt: z.date(),
});
export type WalletProfileDocument = z.infer<typeof walletProfileSchema>;

export const nexusIdentitySchema = z.object({
  nexusIdentityId: z.string().min(1),
  normalizedEmail: z.string().email(),
  displayName: z.string().min(1).max(255).optional(),
  authProvider: z.enum(AUTH_PROVIDERS),
  status: z.enum(IDENTITY_STATUSES),
  locale: z.enum(['he', 'en']).default('he'),
  prismaUserId: z.string().min(1).optional(),
  /**
   * Wallet phone login fields. Phone is the canonical 05XXXXXXXX form;
   * unique-sparse index lets identities without a phone coexist.
   * Spec sections 4.1 and 10.1.
   */
  phone: z.string().regex(/^05\d{8}$/).optional(),
  phoneVerifiedAt: z.date().optional(),
  /**
   * Denormalized email-verified marker for fast /api/me reads.
   * Source of truth for verification state is the matching
   * ContactProfile row; this mirrors it for the common case.
   */
  emailVerifiedAt: z.date().optional(),
  marketingConsent: marketingConsentSchema.optional(),
  /**
   * Wallet default landing context for returning members. A tenantId
   * (land on that tenant's catalog), the literal 'ecosystem' (land on the
   * Nexus catalog), or absent (smart default = last-joined tenant). The
   * effective value is computed in computeWalletMeRouter and surfaced as
   * /api/me defaultTenantId; the member changes it from the wallet's
   * avatar/settings menu via PATCH /api/v1/wallet/default-tenant.
   */
  walletDefaultTenantId: z.string().min(1).max(200).optional(),
  /**
   * Wallet onboarding profile (Plan #3). Optional - new identities
   * created via Google or email-OTP start without a profile and fill
   * it through the wallet slide chain.
   */
  profile: walletProfileSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const contactProfileSchema = z.object({
  contactProfileId: z.string().min(1),
  nexusIdentityId: z.string().min(1),
  channel: z.enum(CONTACT_CHANNELS),
  identifier: z.string().min(1).max(512),
  normalizedIdentifier: z.string().min(1).max(512),
  verified: z.boolean(),
  status: z.enum(CONTACT_STATUSES),
  source: z.string().min(1).max(100),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const tenantUserRoleSchema = z.object({
  tenantUserRoleId: z.string().min(1),
  nexusIdentityId: z.string().min(1),
  tenantId: z.string().min(1).nullable(),
  role: z.enum(TENANT_ROLE_NAMES),
  grantedByIdentityId: z.string().min(1).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const rolePermissionMapSchema = z.object({
  rolePermissionMapId: z.string().min(1),
  role: z.enum(TENANT_ROLE_NAMES),
  permission: z.string().min(1).max(200),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NexusIdentityDocument = z.infer<typeof nexusIdentitySchema> & { _id?: ObjectId };
export type ContactProfileDocument = z.infer<typeof contactProfileSchema> & { _id?: ObjectId };
export type TenantUserRoleDocument = z.infer<typeof tenantUserRoleSchema> & { _id?: ObjectId };
export type RolePermissionMapDocument = z.infer<typeof rolePermissionMapSchema> & { _id?: ObjectId };

export interface IdentityDomainCollections {
  nexusIdentities: Collection<NexusIdentityDocument>;
  contactProfiles: Collection<ContactProfileDocument>;
  tenantUserRoles: Collection<TenantUserRoleDocument>;
  rolePermissionMaps: Collection<RolePermissionMapDocument>;
}

/**
 * Returns typed MongoDB collections for identity domain data.
 * Input: Mongo database handle.
 * Output: collection map used by future identity and authorization services.
 */
export function getIdentityDomainCollections(db: Db): IdentityDomainCollections {
  return {
    nexusIdentities: db.collection<NexusIdentityDocument>(DOMAIN_COLLECTIONS.nexusIdentities),
    contactProfiles: db.collection<ContactProfileDocument>(DOMAIN_COLLECTIONS.contactProfiles),
    tenantUserRoles: db.collection<TenantUserRoleDocument>(DOMAIN_COLLECTIONS.tenantUserRoles),
    rolePermissionMaps: db.collection<RolePermissionMapDocument>(DOMAIN_COLLECTIONS.rolePermissionMaps),
  };
}
