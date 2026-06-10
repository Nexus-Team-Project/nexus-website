/**
 * Short-lived ticket proving a phone was verified by SMS OTP but no
 * NexusIdentity yet owns that phone. The wallet client carries the
 * ticket id back when the user submits an email (or Google), and the
 * server consumes (atomically deletes) the ticket while creating or
 * linking the identity.
 *
 * TTL 30 minutes. Single-use via findOneAndDelete.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.4
 * Side: phone-otp.md decision 10.
 */
import { Db, ObjectId } from 'mongodb';

export const PHONE_SIGNUP_TICKET_COLLECTION = 'phoneSignupTickets';

/** A verified-phone ticket awaiting identity attachment. */
export interface PhoneSignupTicket {
  _id?: ObjectId;
  /** Canonical 05XXXXXXXX. */
  phone: string;
  /** When the phone OTP succeeded. */
  verifiedAt: Date;
  /** TTL-deletion target. 30 min after verifiedAt. */
  expiresAt: Date;
}

/**
 * Ensure indexes on phoneSignupTickets. Idempotent.
 * - expiresAt_ttl: TTL deletes rows after their expiresAt.
 */
export async function ensurePhoneSignupTicketIndexes(db: Db): Promise<void> {
  const col = db.collection<PhoneSignupTicket>(PHONE_SIGNUP_TICKET_COLLECTION);
  await col.createIndex(
    { expiresAt: 1 },
    { name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  );
}
