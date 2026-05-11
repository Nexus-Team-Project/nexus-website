/**
 * Zod validation schemas for tenant contact API endpoints.
 * Covers list queries, single-contact create/update, and bulk CSV import.
 */
import { z } from 'zod';
import { TENANT_CONTACT_STATUSES } from '../models/domain/tenant.models';

/**
 * Validates GET /api/v1/tenant/contacts query parameters.
 * Caps limit at 100 and defaults to page 1, 25 per page.
 */
export const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.enum(TENANT_CONTACT_STATUSES).optional(),
});

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

/**
 * Validates POST /api/v1/tenant/contacts body.
 * Email is required; all other fields are optional.
 */
export const createContactSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().trim().min(1).max(255).default(''),
  status: z.enum(TENANT_CONTACT_STATUSES).default('active'),
  address: z.string().trim().max(500).optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

/**
 * Validates PATCH /api/v1/tenant/contacts/:id body.
 * All fields are optional; at least one must be present.
 */
export const updateContactSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255).optional(),
    status: z.enum(TENANT_CONTACT_STATUSES).optional(),
    address: z.string().trim().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

/**
 * Validates a single row in the bulk CSV import payload.
 * Email is required; displayName, status, and address are optional.
 */
const importContactRowSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().trim().max(255).optional(),
  status: z.enum(TENANT_CONTACT_STATUSES).optional(),
  address: z.string().trim().max(500).optional(),
});

/**
 * Validates POST /api/v1/tenant/contacts/import body.
 * Accepts 1–2000 rows per request.
 */
export const importContactsSchema = z.object({
  rows: z.array(importContactRowSchema).min(1).max(2000),
});

export type ImportContactsInput = z.infer<typeof importContactsSchema>;
export type ImportContactRow = z.infer<typeof importContactRowSchema>;
