/**
 * Sync a wallet member's onboarding answers and display name into every tenant
 * they are an active member of. Reads NexusIdentity.profile, maps to mirror
 * tokens, applies them to each tenant's contact row (set present, unset cleared),
 * and also sets tenantContacts.displayName to the wallet full name when non-empty.
 * Idempotent. Never creates contact rows - only updates existing ones.
 *
 * Spec: docs/superpowers/specs/2026-06-08-wallet-answers-to-contacts-design.md s.6.5
 */
import { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { profileToMirrorTokens, profileFullName, type WalletProfileLike } from '../../config/wallet-profile-fields';
import { applyMirrorTokensToTenantContact } from './wallet-mirror-fields.helper';

/**
 * Apply the identity's current profile answers to all active-member tenants.
 *
 * @param db Mongo handle.
 * @param nexusIdentityId the member whose answers to propagate.
 * @returns the number of tenants whose contact row was touched.
 */
export async function syncWalletProfileToTenants(
  db: Db,
  nexusIdentityId: string,
): Promise<{ tenantsUpdated: number }> {
  const identity = await db
    .collection<{ nexusIdentityId: string; profile?: WalletProfileLike }>(DOMAIN_COLLECTIONS.nexusIdentities)
    .findOne({ nexusIdentityId }, { projection: { profile: 1 } });
  if (!identity?.profile) return { tenantsUpdated: 0 };

  const tokens = profileToMirrorTokens(identity.profile);

  // The Contacts tab shows tenantContacts.displayName. Mirror the wallet full name onto each
  // active-member tenant's contact row. Never blank an existing name: skip when empty.
  const fullName = profileFullName(identity.profile);

  const memberships = await db
    .collection<{ tenantId: string }>(DOMAIN_COLLECTIONS.tenantMembers)
    .find({ nexusIdentityId, status: 'active' }, { projection: { tenantId: 1 } })
    .toArray();

  let tenantsUpdated = 0;
  for (const m of memberships) {
    await applyMirrorTokensToTenantContact(db, m.tenantId, nexusIdentityId, tokens);
    if (fullName) {
      await db.collection(DOMAIN_COLLECTIONS.tenantContacts).updateOne(
        { tenantId: m.tenantId, nexusIdentityId },
        { $set: { displayName: fullName, updatedAt: new Date() } },
      );
    }
    tenantsUpdated += 1;
  }
  return { tenantsUpdated };
}
