/**
 * Defines request schemas for MongoDB-backed tenant member APIs.
 * These schemas validate member management input from the dashboard.
 */
import { z } from 'zod';

const inviteLanguageSchema = z.enum(['he', 'en']).default('he');

export const inviteTenantMemberSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  displayName: z.string().trim().min(1).max(255).optional(),
  roles: z.array(
    z.enum(['admin', 'finance', 'operator', 'analyst', 'developer', 'supply_manager', 'member'])
  ).min(1).default(['member']),
  groupIds: z.array(z.string().min(1)).default([]),
  employeeId: z.string().trim().min(1).max(100).optional(),
  customFields: z.record(z.unknown()).default({}),
  language: inviteLanguageSchema,
  sendEmail: z.boolean().default(true),
});

export const bulkInviteTenantMembersSchema = z.object({
  invitations: z.array(inviteTenantMemberSchema).min(1).max(200),
  language: inviteLanguageSchema,
});

export const inviteTokenParamsSchema = z.object({
  token: z.string().trim().min(24).max(512),
});

export const invitationIdParamsSchema = z.object({
  invitationId: z.string().trim().min(1).max(150).regex(/^tenant_member_invitation_[A-Za-z0-9-]+$/),
});

export type InviteTenantMemberInput = z.infer<typeof inviteTenantMemberSchema>;
export type BulkInviteTenantMembersInput = z.infer<typeof bulkInviteTenantMembersSchema>;
