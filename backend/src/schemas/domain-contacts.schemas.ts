/**
 * Zod validation schemas for tenant contact API endpoints.
 * Covers list queries, single-contact create/update, and bulk CSV import.
 */
import { z } from 'zod';
import { TENANT_CONTACT_STATUSES } from '../models/domain/tenant.models';
import { normalizeIsraeliPhone } from '../utils/israeliPhone';
import { FIELD_ID_RE } from '../services/contact-custom-fields.helper';

/**
 * Optional custom-column values, keyed by the server-generated fieldId. Values
 * are validated/coerced per column type in the service (against the tenant's
 * field definitions); here we only cap the number of keys.
 */
const customFieldsInput = z
  .record(z.unknown())
  .refine((o) => Object.keys(o).length <= 25, { message: 'Too many custom fields' })
  .optional();

/** One custom-column filter, parsed from the JSON `customFilters` query param. */
const customFilterItemSchema = z.object({
  fieldId: z.string().regex(FIELD_ID_RE),
  op: z.enum(['contains', 'range', 'in']),
  value: z.unknown(),
});

/**
 * Zod transform that normalizes optional Israeli phone input to the
 * canonical "05XXXXXXXX" form, or rejects when the value cannot be parsed.
 * Treats undefined and blank strings as "no phone provided".
 */
const israeliPhoneInput = z
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

/**
 * Validates GET /api/v1/tenant/contacts query parameters.
 * Caps limit at 100 and defaults to page 1, 25 per page.
 */
export const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.enum(TENANT_CONTACT_STATUSES).optional(),
  // JSON-encoded array of { fieldId, op, value } custom-column filters. Parsed
  // defensively here; per-type/value validation happens in the service.
  customFilters: z
    .string()
    .optional()
    .transform((s): z.infer<typeof customFilterItemSchema>[] => {
      if (!s) return [];
      try {
        return z.array(customFilterItemSchema).max(25).parse(JSON.parse(s));
      } catch {
        return [];
      }
    }),
});

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

/**
 * Validates POST /api/v1/tenant/contacts body.
 * Status is not accepted — all new contacts start as inactive.
 * Status advances automatically through the invite lifecycle.
 */
export const createContactSchema = z.object({
  email: z.string().email().max(255),
  // Required: a contact must have a display name (the default('') previously
  // collided with min(1), making name-less creates fail validation).
  displayName: z.string().trim().min(1, 'Full name is required').max(255),
  address: z.string().trim().max(500).optional(),
  phone: israeliPhoneInput,
  customFields: customFieldsInput,
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
    phone: israeliPhoneInput,
    customFields: customFieldsInput,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

/**
 * Validates a single row in the bulk CSV import payload.
 * Status is ignored — all imported contacts start as inactive.
 */
const importContactRowSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().trim().max(255).optional(),
  address: z.string().trim().max(500).optional(),
  phone: israeliPhoneInput,
  customFields: customFieldsInput,
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
