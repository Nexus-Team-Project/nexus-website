/**
 * Zod schemas for tenant member list query parameters.
 * Validates and coerces pagination, search, and filter inputs from HTTP query strings.
 */
import { z } from 'zod';

/** Tenant-scoped roles (excludes platform roles). */
const TENANT_MEMBER_ROLES = [
  'admin',
  'finance',
  'operator',
  'analyst',
  'developer',
  'supply_manager',
  'member',
] as const;

/** Member statuses surfaced to the admin member list. */
const FILTERABLE_MEMBER_STATUSES = ['active', 'suspended', 'deactivated'] as const;

/**
 * Validates and coerces query params for GET /api/v1/tenant/members.
 * Caps limit at 100 per request to prevent abuse. Defaults: page 1, limit 25.
 */
export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.enum(FILTERABLE_MEMBER_STATUSES).optional(),
  role: z.enum(TENANT_MEMBER_ROLES).optional(),
});

export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
