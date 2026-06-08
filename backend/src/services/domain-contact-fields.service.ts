/**
 * Manages tenant-defined custom columns (field definitions) for the contacts
 * table. One document per column in `tenantContactFields`. Reads require
 * members.view; mutations require members.update. Deleting a column also clears
 * its value from every contact so no orphaned data lingers.
 */
import { randomUUID } from 'crypto';
import type { Db } from 'mongodb';
import { getMongoDb } from '../config/mongo';
import { getTenantDomainCollections, type TenantContactFieldDocument } from '../models/domain';
import { requireTenantMemberPermission } from './domain-member.service';
import { createError } from '../middleware/errorHandler';
import { MAX_CONTACT_FIELDS } from './contact-custom-fields.helper';
import type {
  CreateContactFieldInput,
  RenameContactFieldInput,
  ReorderContactFieldsInput,
} from '../schemas/domain-contact-fields.schemas';

/** Field definition shape returned to clients (no internal _id/timestamps). */
export interface ContactFieldDto {
  fieldId: string;
  name: string;
  type: TenantContactFieldDocument['type'];
  options?: string[];
  order: number;
  /** 'manual' (default) or 'wallet_profile' for read-only mirror columns. */
  origin?: 'manual' | 'wallet_profile';
  /** Stable mirror-field key when origin === 'wallet_profile'. */
  sourceFieldKey?: string;
}

/** Error code returned when a caller tries to mutate a read-only mirror column. */
const WALLET_FIELD_READONLY = 'wallet_field_readonly';

/** Generates a server-side custom-field id (`cf_<32 hex>`). */
function newFieldId(): string {
  return `cf_${randomUUID().replace(/-/g, '')}`;
}

/** Maps a stored field document to its client DTO. */
function toDto(doc: TenantContactFieldDocument): ContactFieldDto {
  return {
    fieldId: doc.fieldId,
    name: doc.name,
    type: doc.type,
    ...(doc.options ? { options: doc.options } : {}),
    order: doc.order,
    ...(doc.origin ? { origin: doc.origin } : {}),
    ...(doc.sourceFieldKey ? { sourceFieldKey: doc.sourceFieldKey } : {}),
  };
}

/**
 * Throws 400 when the target field is a read-only wallet_profile mirror column.
 * Mirror columns are owned by the member's wallet answers; admins cannot rename,
 * delete, or reorder them.
 */
async function assertNotWalletField(
  col: ReturnType<typeof getTenantDomainCollections>['tenantContactFields'],
  tenantId: string,
  fieldId: string,
): Promise<void> {
  const doc = await col.findOne({ tenantId, fieldId }, { projection: { origin: 1 } });
  if (doc?.origin === 'wallet_profile') {
    throw createError(WALLET_FIELD_READONLY, 400);
  }
}

/**
 * Loads a tenant's field definitions (ordered). Internal helper with NO
 * permission check - callers must already hold a verified tenant context.
 * Used by the contacts service to validate/render custom values.
 */
export async function fetchContactFieldDefs(
  db: Db,
  tenantId: string,
): Promise<TenantContactFieldDocument[]> {
  return getTenantDomainCollections(db)
    .tenantContactFields.find({ tenantId })
    .sort({ order: 1 })
    .toArray();
}

/** Lists the calling tenant's custom columns. Requires members.view. */
export async function listContactFields(userId: string): Promise<ContactFieldDto[]> {
  const access = await requireTenantMemberPermission(userId, 'members.view');
  const db = await getMongoDb();
  const defs = await fetchContactFieldDefs(db, access.tenantId);
  return defs.map(toDto);
}

/** Creates a new custom column. Requires members.update. */
export async function createContactField(
  userId: string,
  input: CreateContactFieldInput,
): Promise<ContactFieldDto> {
  const access = await requireTenantMemberPermission(userId, 'members.update');
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContactFields;

  // Mirror columns (origin: 'wallet_profile') do not count against the manual cap.
  const count = await col.countDocuments({ tenantId: access.tenantId, origin: { $ne: 'wallet_profile' } });
  if (count >= MAX_CONTACT_FIELDS) {
    throw createError(`Maximum of ${MAX_CONTACT_FIELDS} custom columns reached`, 400);
  }

  // Next order = current max + 1 (new columns append to the right).
  const last = await col.find({ tenantId: access.tenantId }).sort({ order: -1 }).limit(1).next();
  const order = (last?.order ?? -1) + 1;
  const now = new Date();
  const options = input.options ? Array.from(new Set(input.options)) : undefined;

  const doc: TenantContactFieldDocument = {
    fieldId: newFieldId(),
    tenantId: access.tenantId,
    name: input.name,
    type: input.type,
    ...(options ? { options } : {}),
    order,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toDto(doc);
}

/** Renames a custom column (label only - safe; values untouched). Requires members.update. */
export async function renameContactField(
  userId: string,
  fieldId: string,
  input: RenameContactFieldInput,
): Promise<ContactFieldDto> {
  const access = await requireTenantMemberPermission(userId, 'members.update');
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContactFields;

  await assertNotWalletField(col, access.tenantId, fieldId);
  const result = await col.findOneAndUpdate(
    { tenantId: access.tenantId, fieldId },
    { $set: { name: input.name, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!result) throw createError('Custom column not found', 404);
  return toDto(result);
}

/**
 * Deletes a custom column AND clears its value from every contact of the tenant.
 * Requires members.update.
 */
export async function deleteContactField(userId: string, fieldId: string): Promise<{ ok: true }> {
  const access = await requireTenantMemberPermission(userId, 'members.update');
  const db = await getMongoDb();
  const cols = getTenantDomainCollections(db);

  await assertNotWalletField(cols.tenantContactFields, access.tenantId, fieldId);
  const deleted = await cols.tenantContactFields.deleteOne({ tenantId: access.tenantId, fieldId });
  if (deleted.deletedCount === 0) throw createError('Custom column not found', 404);

  // Strip the now-orphaned value from every contact (dot-path is safe: fieldId
  // was matched to a real definition above and follows the cf_<id> shape).
  await cols.tenantContacts.updateMany(
    { tenantId: access.tenantId },
    { $unset: { [`customFields.${fieldId}`]: '' } },
  );
  return { ok: true };
}

/**
 * Reorders custom columns. Only ids belonging to the caller's tenant are
 * touched. Requires members.update.
 */
export async function reorderContactFields(
  userId: string,
  input: ReorderContactFieldsInput,
): Promise<ContactFieldDto[]> {
  const access = await requireTenantMemberPermission(userId, 'members.update');
  const db = await getMongoDb();
  const col = getTenantDomainCollections(db).tenantContactFields;

  const now = new Date();
  // Mirror columns are read-only: never let the client reorder them.
  const walletIds = new Set(
    (await col.find({ tenantId: access.tenantId, origin: 'wallet_profile' }).project({ fieldId: 1 }).toArray())
      .map((d) => d.fieldId as string),
  );
  const ops = input.order
    .filter((o) => !walletIds.has(o.fieldId))
    .map((o) => ({
      updateOne: {
        filter: { tenantId: access.tenantId, fieldId: o.fieldId },
        update: { $set: { order: o.order, updatedAt: now } },
      },
    }));
  if (ops.length > 0) await col.bulkWrite(ops, { ordered: false });

  const defs = await fetchContactFieldDefs(db, access.tenantId);
  return defs.map(toDto);
}
