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
  'admin',
  'finance',
  'operator',
  'analyst',
  'developer',
  'supply_manager',
  'member',
  'platform_admin',
  'platform_operator',
  'platform_support',
  'platform_finance',
] as const;

export type AuthProvider = typeof AUTH_PROVIDERS[number];
export type IdentityStatus = typeof IDENTITY_STATUSES[number];
export type ContactChannel = typeof CONTACT_CHANNELS[number];
export type ContactStatus = typeof CONTACT_STATUSES[number];
export type TenantUserRoleName = typeof TENANT_ROLE_NAMES[number];

export const nexusIdentitySchema = z.object({
  nexusIdentityId: z.string().min(1),
  normalizedEmail: z.string().email(),
  displayName: z.string().min(1).max(255).optional(),
  authProvider: z.enum(AUTH_PROVIDERS),
  status: z.enum(IDENTITY_STATUSES),
  locale: z.enum(['he', 'en']).default('he'),
  prismaUserId: z.string().min(1).optional(),
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
