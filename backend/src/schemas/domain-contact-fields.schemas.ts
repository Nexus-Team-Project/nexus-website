/**
 * Zod schemas for tenant contact custom-column (field-definition) endpoints:
 * create, rename, and reorder. The value-level validation of contact data lives
 * in services/contact-custom-fields.helper.ts.
 */
import { z } from 'zod';
import { CONTACT_FIELD_TYPES } from '../models/domain';
import { FIELD_ID_RE, MAX_FIELD_NAME, MAX_OPTION_LEN, MAX_OPTIONS } from '../services/contact-custom-fields.helper';

/** Column types that carry an admin-defined option list. */
const LABEL_TYPES = ['single_label', 'multi_label'] as const;

/**
 * POST /api/v1/tenant/contact-fields - create a custom column. Label types
 * require a non-empty `options` list; other types must not send options.
 */
export const createContactFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_FIELD_NAME),
    type: z.enum(CONTACT_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(MAX_OPTION_LEN)).max(MAX_OPTIONS).optional(),
  })
  .superRefine((d, ctx) => {
    const isLabel = (LABEL_TYPES as readonly string[]).includes(d.type);
    if (isLabel && (!d.options || d.options.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Label columns require at least one option', path: ['options'] });
    }
    if (!isLabel && d.options && d.options.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only label columns accept options', path: ['options'] });
    }
  });

export type CreateContactFieldInput = z.infer<typeof createContactFieldSchema>;

/** PATCH /api/v1/tenant/contact-fields/:fieldId - rename (label only, safe). */
export const renameContactFieldSchema = z.object({
  name: z.string().trim().min(1).max(MAX_FIELD_NAME),
});

export type RenameContactFieldInput = z.infer<typeof renameContactFieldSchema>;

/** PATCH /api/v1/tenant/contact-fields/reorder - new display order per column. */
export const reorderContactFieldsSchema = z.object({
  order: z
    .array(z.object({ fieldId: z.string().regex(FIELD_ID_RE), order: z.number().int().nonnegative() }))
    .min(1)
    .max(50),
});

export type ReorderContactFieldsInput = z.infer<typeof reorderContactFieldsSchema>;
