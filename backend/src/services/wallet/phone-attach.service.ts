/**
 * Attach a phone number to a NexusIdentity — the same canonical store an
 * SMS-login phone lands in — and mirror it onto every tenant contact + member
 * row the identity already has, so the dashboard /users page reflects it.
 *
 * Israel-only for now (matches the InforU SMS provider and the NexusIdentity
 * `^05\d{8}$` shape). Blocks a number already owned by a different identity.
 */
import { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { getIdentityDomainCollections } from '../../models/domain';
import { normalizeIsraeliPhone } from '../../utils/israeliPhone';

/** Typed error so the route can map to a 400 (validation) / 409 (collision). */
export class PhoneAttachError extends Error {
  constructor(public readonly code: 'phone_not_israeli' | 'phone_in_use', message?: string) {
    super(message ?? code);
    this.name = 'PhoneAttachError';
  }
}

/**
 * Normalize + validate an Israeli mobile number.
 * @param raw user-supplied phone (any common formatting / +972).
 * @returns canonical `05XXXXXXXX`.
 * @throws PhoneAttachError('phone_not_israeli') for anything else.
 */
export function requireIsraeliPhone(raw: string): string {
  const normalized = normalizeIsraeliPhone(raw);
  if (!normalized) throw new PhoneAttachError('phone_not_israeli');
  return normalized;
}

/**
 * Attach `phone` to the identity and propagate it to its existing tenant rows.
 * @param args.verified true after a real OTP (sets phoneVerifiedAt); the test
 *        path passes false (saved but not marked verified).
 * @returns the normalized phone.
 * @throws PhoneAttachError('phone_not_israeli' | 'phone_in_use').
 */
export async function attachPhoneToIdentity(
  db: Db,
  args: { nexusIdentityId: string; phone: string; verified: boolean },
): Promise<{ phone: string }> {
  const phone = requireIsraeliPhone(args.phone);
  const { nexusIdentities } = getIdentityDomainCollections(db);

  // Collision: a number owned by a DIFFERENT identity is blocked (the unique
  // sparse index is the hard guard; this gives a clean error first).
  const owner = await nexusIdentities.findOne(
    { phone, nexusIdentityId: { $ne: args.nexusIdentityId } },
    { projection: { nexusIdentityId: 1 } },
  );
  if (owner) throw new PhoneAttachError('phone_in_use');

  const now = new Date();
  const set: Record<string, unknown> = { phone, updatedAt: now };
  if (args.verified) set.phoneVerifiedAt = now;
  try {
    await nexusIdentities.updateOne({ nexusIdentityId: args.nexusIdentityId }, { $set: set });
  } catch (e) {
    // Lost a race to the unique index — surface as a collision, not a 500.
    if (e instanceof Error && e.message.includes('duplicate')) {
      throw new PhoneAttachError('phone_in_use');
    }
    throw e;
  }

  // Mirror onto the identity's existing tenant rows so /users stays in sync.
  // phoneVerified tracks whether the USER confirmed it (real OTP) vs a test save.
  const rowSet = { phone, phoneVerified: args.verified, updatedAt: now };
  await db
    .collection(DOMAIN_COLLECTIONS.tenantMembers)
    .updateMany({ nexusIdentityId: args.nexusIdentityId }, { $set: rowSet });
  await db
    .collection(DOMAIN_COLLECTIONS.tenantContacts)
    .updateMany({ nexusIdentityId: args.nexusIdentityId }, { $set: rowSet });

  return { phone };
}
