/**
 * Phone-collision cleanup. When a phone number is verified by SMS OTP
 * and that same phone is sitting on tenant-supplied notes
 * (tenantContacts.phone or tenantMembersV2.phone) belonging to a
 * DIFFERENT NexusIdentity, those phone fields are cleared. The verified
 * identity wins; the other identity's email and roles are untouched.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.2
 * Side: phone-otp.md 'Phone collision handling'.
 */
import { Db, ObjectId } from 'mongodb';

/**
 * Clear the `phone` field from every tenantContacts and tenantMembersV2
 * row that carries the given phone but belongs to an identity other
 * than the verified owner.
 *
 * @param db Mongo handle
 * @param phone canonical 05XXXXXXXX of the freshly verified phone
 * @param ownerIdentityId _id of the identity that owns the phone
 */
export async function clearStalePhoneEntries(
  db: Db,
  phone: string,
  ownerIdentityId: ObjectId,
): Promise<void> {
  const filter = { phone, identityId: { $ne: ownerIdentityId } };
  const unsetPhone = { $unset: { phone: '' } };
  await Promise.all([
    db.collection('tenantContacts').updateMany(filter, unsetPhone),
    db.collection('tenantMembersV2').updateMany(filter, unsetPhone),
  ]);
}
