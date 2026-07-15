/**
 * Defines request schemas for MongoDB-backed tenant member APIs.
 * These schemas validate member management input from the dashboard.
 */
import { z } from 'zod';
import { normalizeIsraeliPhone } from '../utils/israeliPhone';

const inviteLanguageSchema = z.enum(['he', 'en']).default('he');

/**
 * Optional Israeli phone input for invite payloads.
 * Accepts "0508465858", "+972508465858", "972...", and common separators.
 * Normalizes to the canonical "05XXXXXXXX" form or rejects with 400.
 * Blank / undefined input is silently dropped (treated as "no phone").
 */
const inviteIsraeliPhoneSchema = z
  .string()
  .trim()
  .max(32)
  .optional()
  .transform((val, ctx) => {
    if (val === undefined || val === '') return undefined;
    const normalized = normalizeIsraeliPhone(val);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid Israeli phone number. Use 05XXXXXXXX or +972XXXXXXXX.',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const inviteTenantMemberSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  displayName: z.string().trim().min(1).max(255).optional(),
  /**
   * Privileged staff roles only. 'member' was removed (2026-07-15): regular
   * members join exclusively through the wallet join-request flow. A stale
   * client sending 'member' gets a 400; a stale client sending 'services'
   * has it stripped (z.object drops unknown keys) - never trusted. The
   * backend stamps ALL SERVICE_KEYS on privileged invites.
   */
  roles: z.array(
    z.enum(['admin', 'finance', 'operator', 'analyst', 'developer', 'supply_manager'])
  ).min(1),
  groupIds: z.array(z.string().min(1)).default([]),
  employeeId: z.string().trim().min(1).max(100).optional(),
  customFields: z.record(z.unknown()).default({}),
  // Optional Israeli mobile to carry from invite to the new tenant member.
  phone: inviteIsraeliPhoneSchema,
  language: inviteLanguageSchema,
  sendEmail: z.boolean().default(true),
});

export const bulkInviteTenantMembersSchema = z.object({
  invitations: z.array(inviteTenantMemberSchema).min(1).max(200),
  language: inviteLanguageSchema,
});

// The async bulk route raises the per-request cap to 1000. Larger submits
// are chunked client-side and the worker handles delivery in the background.
export const bulkInviteTenantMembersAsyncSchema = z.object({
  invitations: z.array(inviteTenantMemberSchema).min(1).max(1000),
  language: inviteLanguageSchema,
});

export const inviteJobIdParamsSchema = z.object({
  // Accepts both queue kinds: bulk member invites and service outreach.
  jobId: z.string().trim().min(1).max(150).regex(/^(member_invite_job|service_outreach_job)_[A-Za-z0-9-]+$/),
});

export const inviteTokenParamsSchema = z.object({
  token: z.string().trim().min(24).max(512),
});

export const invitationIdParamsSchema = z.object({
  invitationId: z.string().trim().min(1).max(150).regex(/^tenant_member_invitation_[A-Za-z0-9-]+$/),
});

export type InviteTenantMemberInput = z.infer<typeof inviteTenantMemberSchema>;
export type BulkInviteTenantMembersInput = z.infer<typeof bulkInviteTenantMembersSchema>;
export type BulkInviteTenantMembersAsyncInput = z.infer<typeof bulkInviteTenantMembersAsyncSchema>;
