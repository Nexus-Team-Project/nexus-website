/**
 * Lifecycle helpers for the short-lived 'phone verified, identity not
 * yet attached' state. Tickets are written after phone-OTP succeeds for
 * an unknown phone, and consumed (atomically deleted) when the user
 * supplies email or Google.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 4.4
 * Side: phone-otp.md decision 10.
 */
import { Db, ObjectId } from 'mongodb';
import {
  PHONE_SIGNUP_TICKET_COLLECTION,
  type PhoneSignupTicket,
} from '../../models/auth/phone-signup-ticket.models';

const DEFAULT_TTL_MIN = 30;

/**
 * Create a single-use signup ticket for a verified phone.
 *
 * @param db Mongo handle
 * @param phone canonical 05XXXXXXXX phone
 * @param ttlMinutes ticket lifetime in minutes (default 30; negative values
 *   create an already-expired ticket, used in tests)
 */
export async function createPhoneSignupTicket(
  db: Db,
  phone: string,
  ttlMinutes: number = DEFAULT_TTL_MIN,
): Promise<{ id: string }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const res = await db
    .collection<PhoneSignupTicket>(PHONE_SIGNUP_TICKET_COLLECTION)
    .insertOne({ phone, verifiedAt: now, expiresAt });
  return { id: res.insertedId.toHexString() };
}

/**
 * Atomically consume a signup ticket: returns the phone and deletes the
 * row in one operation, so a ticket can never be consumed twice. Throws
 * `ticket_invalid` for any of: malformed id, no such row, expired row.
 */
export async function consumePhoneSignupTicket(
  db: Db,
  ticketId: string,
): Promise<{ phone: string }> {
  if (!ObjectId.isValid(ticketId)) throw new Error('ticket_invalid');
  const doc = await db
    .collection<PhoneSignupTicket>(PHONE_SIGNUP_TICKET_COLLECTION)
    .findOneAndDelete({
      _id: new ObjectId(ticketId),
      expiresAt: { $gt: new Date() },
    });
  if (!doc) throw new Error('ticket_invalid');
  return { phone: doc.phone };
}
