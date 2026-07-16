/**
 * Phone-collision cleanup. When a phone number is verified by SMS OTP
 * and that same phone sits on tenantContacts / tenantMembersV2 rows that
 * are LINKED to a DIFFERENT NexusIdentity, those phone fields are cleared:
 * the freshly verified identity wins; the other identity's email and roles
 * are untouched.
 *
 * Rows with NO nexusIdentityId are tenant address-book entries (imported /
 * manually added contacts, service-outreach targets) - they are the source
 * for the wallet match screen (contact-match.service) and MUST keep their
 * phone, so they are explicitly excluded here.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.2
 * Side: phone-otp.md 'Phone collision handling'.
 */
import { Db } from 'mongodb';

/**
 * Clear the `phone` field from every tenantContacts and tenantMembersV2
 * row that carries the given phone AND is linked to an identity other
 * than the verified owner. Unlinked rows are left untouched.
 *
 * @param db Mongo handle
 * @param phone canonical 05XXXXXXXX of the freshly verified phone
 * @param ownerNexusIdentityId `nexusIdentityId` string of the verified owner
 */
export async function clearStalePhoneEntries(
  db: Db,
  phone: string,
  ownerNexusIdentityId: string,
): Promise<void> {
  const filter = {
    phone,
    nexusIdentityId: { $exists: true, $ne: ownerNexusIdentityId },
  };
  const unsetPhone = { $unset: { phone: '' } };
  await Promise.all([
    db.collection('tenantContacts').updateMany(filter, unsetPhone),
    db.collection('tenantMembersV2').updateMany(filter, unsetPhone),
  ]);
}
