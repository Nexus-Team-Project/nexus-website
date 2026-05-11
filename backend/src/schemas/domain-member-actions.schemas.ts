/**
 * Zod validation schemas for tenant member action endpoints.
 * Covers role updates, email changes, and the remove-member operation.
 */
import { z } from 'zod';
import { TENANT_ROLE_NAMES } from '../models/domain/identity.models';

/**
 * Validates PATCH /tenant/members/:id/roles body.
 * At least one role is required; duplicates are accepted (deduped in service).
 */
export const updateMemberRolesSchema = z.object({
  roles: z
    .array(z.enum(TENANT_ROLE_NAMES as unknown as [string, ...string[]]))
    .min(1, 'At least one role is required'),
});

export type UpdateMemberRolesInput = z.infer<typeof updateMemberRolesSchema>;

/**
 * Validates PATCH /tenant/members/:id/email body.
 * Email must be a valid address and at most 255 characters.
 */
export const updateMemberEmailSchema = z.object({
  email: z.string().email().max(255),
});

export type UpdateMemberEmailInput = z.infer<typeof updateMemberEmailSchema>;

/**
 * Validates PATCH /tenant/contacts/:id/email body.
 * Same shape as updateMemberEmailSchema — extracted for clarity.
 */
export const updateContactEmailSchema = z.object({
  email: z.string().email().max(255),
});

export type UpdateContactEmailInput = z.infer<typeof updateContactEmailSchema>;
