/**
 * Manages tenant-scoped contact records in MongoDB.
 * Contacts are the tenant's own address book — people who do not need to
 * have accepted a Nexus invite or created a Nexus account.
 * All mutations require members.update permission; reads require members.view.
 */
import { randomUUID } from 'crypto';
import { getMongoDb } from '../config/mongo';
import { getTenantDomainCollections, type TenantContactDocument } from '../models/domain';
import { requireTenantMemberPermission } from './domain-member.service';
import type { ListContactsQuery, CreateContactInput, UpdateContactInput, ImportContactRow } from '../schemas/domain-contacts.schemas';
import { createError } from '../middleware/errorHandler';

/** One row returned in the paginated contact list. */
export interface TenantContactListItem {
  tenantContactId: string;
  email: string;
  displayName: string;
  status: string;
  address: string | null;
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
    email: doc.email,
    displayName: doc.displayName,
    status: doc.status,
    address: doc.address ?? null,
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
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ normalizedEmail: pattern }, { displayName: pattern }];
  }

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
 * Creates a single tenant contact record, or updates it if the email already exists.
 * Input: Prisma user id, validated create payload.
 * Output: created or updated contact.
 */
export async function createTenantContact(
  userId: string,
  data: CreateContactInput,
): Promise<TenantContactListItem> {
  const access = await requireTenantMemberPermission(userId, 'members.update');
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContacts;

  const normalized = normalizeEmail(data.email);
  const now = new Date();

  const result = await col.findOneAndUpdate(
    { tenantId: access.tenantId, normalizedEmail: normalized },
    {
      $setOnInsert: {
        tenantContactId: randomUUID(),
        tenantId: access.tenantId,
        email: data.email.trim(),
        normalizedEmail: normalized,
        createdAt: now,
      },
      $set: {
        displayName: data.displayName,
        status: 'inactive', // all contacts start inactive; status advances via invite lifecycle
        ...(data.address !== undefined && { address: data.address }),
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

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

  const result = await col.findOneAndUpdate(
    { tenantContactId: contactId, tenantId: access.tenantId },
    { $set: { ...data, updatedAt: new Date() } },
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

  for (const row of rows) {
    const normalized = normalizeEmail(row.email);
    if (seen.has(normalized)) {
      errors.push(`Duplicate email in batch: ${row.email}`);
      continue;
    }
    seen.add(normalized);

    ops.push({
      updateOne: {
        filter: { tenantId: access.tenantId, normalizedEmail: normalized },
        update: {
          $setOnInsert: {
            tenantContactId: randomUUID(),
            tenantId: access.tenantId,
            email: row.email.trim(),
            normalizedEmail: normalized,
            createdAt: now,
          },
          $set: {
            displayName: row.displayName ?? '',
            status: 'inactive', // all imported contacts start inactive
            ...(row.address !== undefined && { address: row.address }),
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

  const result = await col.bulkWrite(ops, { ordered: false });
  const imported = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  const skipped = rows.length - ops.length;

  return { imported, skipped, errors };
}
