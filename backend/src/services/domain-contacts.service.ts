/**
 * Manages tenant-scoped contact records in MongoDB.
 * Contacts are the tenant's own address book — people who do not need to
 * have accepted a Nexus invite or created a Nexus account.
 * All mutations require members.update permission; reads require members.view.
 */
import { randomUUID } from 'crypto';
import { MongoBulkWriteError } from 'mongodb';
import { getMongoDb } from '../config/mongo';
import { getTenantDomainCollections, type TenantContactDocument } from '../models/domain';
import { requireTenantMemberPermission } from './domain-member.service';
import type { ListContactsQuery, CreateContactInput, UpdateContactInput, ImportContactRow } from '../schemas/domain-contacts.schemas';
import { createError } from '../middleware/errorHandler';
import { fetchContactFieldDefs } from './domain-contact-fields.service';
import { planCustomWrites, buildCustomFilterClauses, type CustomFilter } from './contact-custom-fields.helper';

/** One row returned in the paginated contact list. */
export interface TenantContactListItem {
  tenantContactId: string;
  /** Contact email, or null for phone-only contacts. */
  email: string | null;
  displayName: string;
  status: string;
  address: string | null;
  /** Canonical Israeli mobile number ("05XXXXXXXX") or null when not provided. */
  phone: string | null;
  /**
   * True only when the member verified this number themselves (SMS / wallet OTP).
   * A tenant-entered or test-attached number is false — it is a guess until the
   * user confirms it.
   */
  phoneVerified: boolean;
  /** Custom-column values keyed by fieldId; empty when none set. */
  customFields: Record<string, unknown>;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Pagination metadata shared across paged responses. */
export interface ContactPaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/**
 * Escapes special regex characters in a user-supplied search string.
 * Input: raw search string from query params.
 * Output: safe regex string without injection risk.
 */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes an email address for storage and uniqueness checks.
 * Input: raw email string.
 * Output: trimmed lowercase email.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Maps a MongoDB TenantContact document to the API list item shape.
 * Input: raw MongoDB document.
 * Output: serializable list item with ISO date strings.
 */
function toListItem(doc: TenantContactDocument): TenantContactListItem {
  return {
    tenantContactId: doc.tenantContactId,
    email: doc.email ?? null,
    displayName: doc.displayName,
    status: doc.status,
    address: doc.address ?? null,
    phone: doc.phone ?? null,
    phoneVerified: doc.phoneVerified ?? false,
    customFields: (doc.customFields as Record<string, unknown>) ?? {},
    lastActivityAt: doc.lastActivityAt ? doc.lastActivityAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Lists tenant contacts with pagination and optional search/status filter.
 * Input: Prisma user id from authenticated request, validated query params.
 * Output: paged contact rows and pagination metadata.
 */
export async function listTenantContacts(
  userId: string,
  query: ListContactsQuery,
): Promise<{ tenantId: string; contacts: TenantContactListItem[]; pagination: ContactPaginationMeta }> {
  const access = await requireTenantMemberPermission(userId, 'members.view');
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContacts;

  const filter: Record<string, unknown> = { tenantId: access.tenantId };
  if (query.status) filter.status = query.status;

  // Combine free-text search and custom-column filters under a single $and so
  // they all narrow the result set together.
  const and: Record<string, unknown>[] = [];
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    and.push({ $or: [{ normalizedEmail: pattern }, { displayName: pattern }] });
  }
  const defs = await fetchContactFieldDefs(db, access.tenantId);
  and.push(...buildCustomFilterClauses(defs, (query.customFilters ?? []) as CustomFilter[]));
  if (and.length) filter.$and = and;

  const skip = (query.page - 1) * query.limit;
  const [docs, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).toArray(),
    col.countDocuments(filter),
  ]);

  return {
    tenantId: access.tenantId,
    contacts: docs.map(toListItem),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Creates a single tenant contact record, or updates it if the identifier
 * already exists. Dedup key: normalizedEmail when the contact has an email,
 * else phone (the schema refine guarantees at least one exists).
 * Input: Prisma user id, validated create payload.
 * Output: created or updated contact. 409 when a new email contact carries a
 * phone already owned by another contact (partial unique phone index).
 */
export async function createTenantContact(
  userId: string,
  data: CreateContactInput,
): Promise<TenantContactListItem> {
  const access = await requireTenantMemberPermission(userId, 'members.update');
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContacts;

  const normalized = data.email !== undefined ? normalizeEmail(data.email) : undefined;
  const now = new Date();

  // Validate custom-column values against the tenant's definitions (strict:
  // an invalid value is a 400 so the admin gets feedback).
  let customSet: Record<string, unknown> = {};
  if (data.customFields) {
    const defs = await fetchContactFieldDefs(db, access.tenantId);
    const plan = planCustomWrites(defs, data.customFields);
    if (plan.invalid.length) throw createError(`Invalid value for: ${plan.invalid.join(', ')}`, 400);
    customSet = plan.set;
  }

  // Dedup key: normalizedEmail when the contact has an email, else phone
  // (schema refine guarantees at least one exists).
  const filter =
    normalized !== undefined
      ? { tenantId: access.tenantId, normalizedEmail: normalized }
      : { tenantId: access.tenantId, phone: data.phone as string };

  let result: TenantContactDocument | null;
  try {
    result = await col.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          tenantContactId: randomUUID(),
          tenantId: access.tenantId,
          ...(data.email !== undefined && normalized !== undefined
            ? { email: data.email.trim(), normalizedEmail: normalized }
            : {}),
          createdAt: now,
        },
        $set: {
          displayName: data.displayName,
          status: 'inactive', // all contacts start inactive; status advances via invite lifecycle
          ...(data.address !== undefined && { address: data.address }),
          // A tenant-entered phone is a guess -> unverified until the user confirms.
          ...(data.phone !== undefined && { phone: data.phone, phoneVerified: false }),
          ...customSet,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    // uniq_tenant_phone_partial: the phone already belongs to another contact.
    if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
      throw createError('A contact with this phone already exists', 409);
    }
    throw error;
  }

  if (!result) throw createError('Failed to create contact', 500);
  return toListItem(result);
}

/**
 * Updates mutable fields on an existing tenant contact.
 * Input: Prisma user id, contact id (tenantContactId), validated update payload.
 * Output: updated contact or 404 when not found.
 */
export async function updateTenantContact(
  userId: string,
  contactId: string,
  data: UpdateContactInput,
): Promise<TenantContactListItem> {
  const access = await requireTenantMemberPermission(userId, 'members.update');
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContacts;

  // Pull customFields out of the raw spread - it must be validated and written
  // as individual dot-paths, never set wholesale from the request body.
  const { customFields: rawCustom, ...rest } = data;
  const customSet: Record<string, unknown> = {};
  const customUnset: Record<string, ''> = {};
  if (rawCustom) {
    const defs = await fetchContactFieldDefs(db, access.tenantId);
    const plan = planCustomWrites(defs, rawCustom);
    if (plan.invalid.length) throw createError(`Invalid value for: ${plan.invalid.join(', ')}`, 400);
    Object.assign(customSet, plan.set);
    for (const key of plan.clearKeys) customUnset[`customFields.${key}`] = '';
  }

  const update: Record<string, unknown> = {
    // Editing the phone resets verification — it is again a tenant-entered guess.
    $set: { ...rest, ...(rest.phone !== undefined ? { phoneVerified: false } : {}), ...customSet, updatedAt: new Date() },
  };
  if (Object.keys(customUnset).length) update.$unset = customUnset;

  const result = await col.findOneAndUpdate(
    { tenantContactId: contactId, tenantId: access.tenantId },
    update,
    { returnDocument: 'after' },
  );

  if (!result) throw createError('Contact not found', 404);
  return toListItem(result);
}

/**
 * Bulk-upserts contacts from a CSV import payload.
 * Rows with invalid or duplicate emails within the batch are skipped.
 * Uses MongoDB bulkWrite with upsert so existing contacts update without overwriting createdAt.
 * Input: Prisma user id, validated import rows.
 * Output: counts of imported and skipped rows.
 */
export async function importTenantContacts(
  userId: string,
  rows: ImportContactRow[],
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const access = await requireTenantMemberPermission(userId, 'members.update');
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContacts;

  const seen = new Set<string>();
  const ops: import('mongodb').AnyBulkWriteOperation<TenantContactDocument>[] = [];
  const errors: string[] = [];
  const now = new Date();
  // Load the tenant's column definitions once for the whole batch.
  const defs = await fetchContactFieldDefs(db, access.tenantId);

  for (const [index, row] of rows.entries()) {
    const normalized = row.email !== undefined ? normalizeEmail(row.email) : undefined;
    // Dedup key: normalizedEmail when the row has an email, else the phone
    // (prefixed so an email can never collide with a phone string).
    const dedupKey = normalized ?? (row.phone !== undefined ? `phone:${row.phone}` : undefined);
    if (dedupKey === undefined) {
      // Defense in depth: the row schema refine already rejects this shape,
      // but direct service callers still get a counted skip, never a drop.
      errors.push(`Row ${index + 1}: missing both email and phone`);
      continue;
    }
    if (seen.has(dedupKey)) {
      errors.push(`Duplicate identifier in batch: ${normalized ?? row.phone}`);
      continue;
    }
    seen.add(dedupKey);

    // Lenient: an invalid custom value is simply left blank (cell omitted), the
    // row is still imported. Only validated values become dot-path $set entries.
    const customSet = row.customFields ? planCustomWrites(defs, row.customFields).set : {};

    ops.push({
      updateOne: {
        filter:
          normalized !== undefined
            ? { tenantId: access.tenantId, normalizedEmail: normalized }
            : { tenantId: access.tenantId, phone: row.phone as string },
        update: {
          $setOnInsert: {
            tenantContactId: randomUUID(),
            tenantId: access.tenantId,
            ...(row.email !== undefined && normalized !== undefined
              ? { email: row.email.trim(), normalizedEmail: normalized }
              : {}),
            createdAt: now,
          },
          $set: {
            displayName: row.displayName ?? '',
            status: 'inactive', // all imported contacts start inactive
            ...(row.address !== undefined && { address: row.address }),
            // Imported phones are tenant-supplied guesses -> unverified.
            ...(row.phone !== undefined && { phone: row.phone, phoneVerified: false }),
            ...customSet,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length === 0) {
    return { imported: 0, skipped: rows.length, errors };
  }

  let result: import('mongodb').BulkWriteResult;
  try {
    result = await col.bulkWrite(ops, { ordered: false });
  } catch (error) {
    // Unordered bulkWrite throws AFTER processing every op; cross-row phone/email
    // uniqueness conflicts land here. Surface them in errors, keep the partial result.
    if (error instanceof MongoBulkWriteError) {
      errors.push('Some rows conflicted with an existing contact email or phone');
      result = error.result;
    } else {
      throw error;
    }
  }
  const imported = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  const skipped = rows.length - ops.length;

  return { imported, skipped, errors };
}
