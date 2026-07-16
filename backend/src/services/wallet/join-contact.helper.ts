/**
 * Contact upsert for a member joining a tenant (invite accept, manual
 * approval, auto-accept). Handles the duplicate-human merge: a tenant may
 * hold TWO rows for one person - one keyed by email, one phone-only
 * (imported / outreach target). A blind email-keyed upsert would insert a
 * second row carrying the same phone and trip the partial unique
 * (tenantId, phone) index, failing the whole approval. This helper resolves
 * both candidate rows first, keeps one, absorbs the other.
 */
import { randomUUID } from 'crypto';
import { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';

/** The contact fields this upsert reads back for merge decisions. */
interface ContactRow {
  tenantContactId: string;
  serviceInvites?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  displayName?: string;
}

/**
 * Upsert the joining member's row in the tenant's Contacts tab.
 *
 * Behavior:
 * - Row found by email AND a different row found by phone: keep the email
 *   row, merge the phone row's serviceInvites/customFields into it (kept
 *   row's values win), delete the phone row, then stamp the kept row.
 * - Single row found (by email OR phone): update it in place - a phone-only
 *   outreach contact gains the email; an email contact gains the verified
 *   phone. Links nexusIdentityId, flips status active.
 * - No row: insert a fresh active contact.
 *
 * displayName: `fullName` (wallet profile) always wins; otherwise an existing
 * row keeps its name and only a new/nameless row gets the fallback.
 *
 * @param db Mongo handle
 * @param args tenant + identity + normalized email, wallet-profile fullName
 *   (empty string when absent), optional caller displayName fallback, the
 *   `{ phone, phoneVerified }` fields to stamp (empty object when the
 *   identity has no phone), and the shared `now` timestamp.
 */
export async function upsertJoinedTenantContact(
  db: Db,
  args: {
    tenantId: string;
    nexusIdentityId: string;
    email: string;
    displayName?: string;
    fullName: string | null;
    phoneFields: { phone?: string; phoneVerified?: boolean };
    now: Date;
  },
): Promise<void> {
  const { tenantId, email, now } = args;
  const fallbackName = args.displayName ?? email.split('@')[0];

  const contactSetOnInsert: Record<string, unknown> = {
    tenantContactId: `tenant_contact_${randomUUID()}`,
    tenantId,
    email,
    normalizedEmail: email,
    createdAt: now,
  };
  // nexusIdentityId is in $set (not $setOnInsert) so a pre-existing
  // admin-added contact (added by email, no identity link) gets backfilled
  // when its owner joins - otherwise the profile mirror write, which matches
  // by nexusIdentityId, would silently miss that row.
  const contactSet: Record<string, unknown> = {
    status: 'active', lastActivityAt: now, updatedAt: now,
    nexusIdentityId: args.nexusIdentityId, ...args.phoneFields,
  };
  if (args.fullName) {
    contactSet.displayName = args.fullName;
  } else {
    contactSetOnInsert.displayName = fallbackName;
  }

  const contacts = db.collection<ContactRow>(DOMAIN_COLLECTIONS.tenantContacts);
  const byEmail = await contacts.findOne({ tenantId, normalizedEmail: email });
  const byPhone = args.phoneFields.phone
    ? await contacts.findOne({
        tenantId,
        phone: args.phoneFields.phone,
        ...(byEmail ? { tenantContactId: { $ne: byEmail.tenantContactId } } : {}),
      })
    : null;

  let target = byEmail ?? byPhone;
  if (byEmail && byPhone) {
    const mergedInvites = { ...byPhone.serviceInvites, ...byEmail.serviceInvites };
    if (Object.keys(mergedInvites).length) contactSet.serviceInvites = mergedInvites;
    const mergedCustom = { ...byPhone.customFields, ...byEmail.customFields };
    if (Object.keys(mergedCustom).length) contactSet.customFields = mergedCustom;
    await contacts.deleteOne({ tenantContactId: byPhone.tenantContactId });
    target = byEmail;
  }

  if (target) {
    // A phone-only row gains the email here; an email row gains the phone.
    await contacts.updateOne(
      { tenantContactId: target.tenantContactId },
      {
        $set: {
          ...contactSet,
          email,
          normalizedEmail: email,
          ...(!args.fullName && !target.displayName ? { displayName: fallbackName } : {}),
        },
      },
    );
  } else {
    await contacts.updateOne(
      { tenantId, normalizedEmail: email },
      { $setOnInsert: contactSetOnInsert, $set: contactSet },
      { upsert: true },
    );
  }
}
