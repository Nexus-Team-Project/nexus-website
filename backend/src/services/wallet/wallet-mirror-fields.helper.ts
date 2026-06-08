/**
 * Helpers for materializing wallet mirror columns on a tenant's contacts.
 * `ensureMirrorField` idempotently creates the per-tenant wallet_profile column;
 * `applyMirrorTokensToTenantContact` writes set tokens and unsets cleared ones
 * for a single contact identified by its NexusIdentity id.
 *
 * Spec: docs/superpowers/specs/2026-06-08-wallet-answers-to-contacts-design.md
 */
import { Db } from 'mongodb';
import { randomUUID } from 'crypto';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import {
  getMirrorFieldDefs,
  getMirrorFieldDef,
  type MirrorFieldDef,
} from '../../config/wallet-profile-fields';

/** Server-generated custom-field id (matches FIELD_ID_RE: cf_<32 hex>). */
function newFieldId(): string {
  return `cf_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Ensure the tenant has the wallet_profile mirror column for this def. Returns
 * its fieldId. Idempotent: re-reads on the unique-index race.
 *
 * @param db Mongo handle.
 * @param tenantId tenant owning the column.
 * @param def the mirror-field definition to materialize.
 * @returns the column's fieldId.
 */
export async function ensureMirrorField(db: Db, tenantId: string, def: MirrorFieldDef): Promise<string> {
  const col = db.collection(DOMAIN_COLLECTIONS.tenantContactFields);
  const existing = await col.findOne({ tenantId, origin: 'wallet_profile', sourceFieldKey: def.sourceFieldKey });
  if (existing) return existing.fieldId as string;

  const last = await col.find({ tenantId }).sort({ order: -1 }).limit(1).next();
  const order = ((last?.order as number | undefined) ?? -1) + 1;
  const now = new Date();
  const fieldId = newFieldId();
  try {
    await col.insertOne({
      fieldId,
      tenantId,
      name: def.labelEn,
      type: def.columnType,
      ...(def.options ? { options: def.options.map((o) => o.value) } : {}),
      order,
      origin: 'wallet_profile',
      sourceFieldKey: def.sourceFieldKey,
      createdAt: now,
      updatedAt: now,
    });
    return fieldId;
  } catch (e) {
    // Lost the unique-index race: another writer created it. Re-read.
    const again = await col.findOne({ tenantId, origin: 'wallet_profile', sourceFieldKey: def.sourceFieldKey });
    if (again) return again.fieldId as string;
    throw e;
  }
}

/**
 * Apply a `{ sourceFieldKey: token }` map onto a tenant's contact row. For every
 * mirror def: set its column value when a token is present, unset it when absent.
 * Creates mirror columns on demand. No-op when the contact row does not exist.
 *
 * @param db Mongo handle.
 * @param tenantId tenant owning the contact.
 * @param nexusIdentityId identifies the contact row to update.
 * @param tokens map of sourceFieldKey -> stored token (from profileToMirrorTokens).
 */
export async function applyMirrorTokensToTenantContact(
  db: Db,
  tenantId: string,
  nexusIdentityId: string,
  tokens: Record<string, unknown>,
): Promise<void> {
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  for (const def of getMirrorFieldDefs()) {
    const token = tokens[def.sourceFieldKey];
    if (token === undefined || token === null) {
      // Only need to unset if the column exists for this tenant.
      const field = await db.collection(DOMAIN_COLLECTIONS.tenantContactFields)
        .findOne({ tenantId, origin: 'wallet_profile', sourceFieldKey: def.sourceFieldKey });
      if (field) unset[`customFields.${field.fieldId}`] = '';
      continue;
    }
    const fieldId = await ensureMirrorField(db, tenantId, def);
    set[`customFields.${fieldId}`] = token;
  }

  const update: Record<string, unknown> = { $set: { ...set, updatedAt: new Date() } };
  if (Object.keys(unset).length > 0) update.$unset = unset;

  await db.collection(DOMAIN_COLLECTIONS.tenantContacts).updateOne(
    { tenantId, nexusIdentityId },
    update,
  );
}

/** Re-export for callers that map a profile to tokens then apply. */
export { getMirrorFieldDef };
