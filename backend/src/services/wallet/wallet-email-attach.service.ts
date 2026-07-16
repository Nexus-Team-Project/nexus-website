/**
 * Email attach for an ALREADY-AUTHENTICATED wallet caller - the email mirror
 * of the wallet phone attach. Sends a 6-digit email OTP (existing email-OTP
 * infra + its 1/30s + 5/h per-email rate limits); on verify, writes the new
 * verified email everywhere email-OTP signup persists it: Prisma User.email
 * (+ emailVerified) and NexusIdentity.normalizedEmail (+ emailVerifiedAt).
 * Mints no session itself - the route re-issues one because wallet identity
 * resolution keys off the JWT email claim.
 */
import type { Db } from 'mongodb';
import { prisma } from '../../config/database';
import { getIdentityDomainCollections } from '../../models/domain';
import { startEmailOtp, verifyEmailOtp } from '../auth/email-otp.service';

/** Typed error so the route maps to 400 (invalid_request) / 409 (email_in_use). */
export class EmailAttachError extends Error {
  constructor(public readonly code: 'email_in_use' | 'invalid_request', message?: string) {
    super(message ?? code);
    this.name = 'EmailAttachError';
  }
}

const normalize = (e: string): string => e.trim().toLowerCase();

/**
 * Throw email_in_use when a DIFFERENT account (Mongo identity or Prisma user)
 * already owns the email. Called before sending (no wasted email) and again
 * at verify time (race guard before the writes).
 */
async function assertEmailFree(
  db: Db,
  email: string,
  caller: { nexusIdentityId: string; prismaUserId: string },
): Promise<void> {
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const identityOwner = await nexusIdentities.findOne(
    { normalizedEmail: email },
    { projection: { nexusIdentityId: 1 } },
  );
  if (identityOwner && identityOwner.nexusIdentityId !== caller.nexusIdentityId) {
    throw new EmailAttachError('email_in_use');
  }
  const userOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (userOwner && userOwner.id !== caller.prismaUserId) {
    throw new EmailAttachError('email_in_use');
  }
}

/**
 * Start an email-attach OTP for the caller.
 * @throws EmailAttachError('invalid_request') when the email is the caller's
 *         current verified email (nothing to do), ('email_in_use') on
 *         collision; rate_limited from the shared OTP limiter.
 */
export async function startWalletEmailAttach(
  db: Db,
  args: { email: string; ip: string; nexusIdentityId: string; prismaUserId: string; lang?: 'he' | 'en' },
): Promise<{ challengeId: string; __testCode?: string }> {
  const email = normalize(args.email);
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const self = await nexusIdentities.findOne(
    { nexusIdentityId: args.nexusIdentityId },
    { projection: { normalizedEmail: 1, emailVerifiedAt: 1 } },
  );
  if (self?.normalizedEmail === email && self.emailVerifiedAt) {
    // Re-verifying the exact current verified email is a pointless no-op.
    throw new EmailAttachError('invalid_request');
  }
  await assertEmailFree(db, email, args);
  return startEmailOtp(db, {
    email,
    ip: args.ip,
    signupTicketId: null,
    purpose: 'wallet_email_attach',
    lang: args.lang,
  });
}

/**
 * Verify the code and persist the email on the caller's account.
 * Write order: Mongo identity first (domain truth, unique index guards the
 * race), then Prisma; a Prisma unique failure rolls the identity back so the
 * two stores never diverge.
 * @throws otp_invalid | otp_expired | otp_locked | EmailAttachError('email_in_use').
 */
export async function verifyWalletEmailAttach(
  db: Db,
  args: { challengeId: string; code: string; nexusIdentityId: string; prismaUserId: string },
): Promise<{ email: string }> {
  const { email } = await verifyEmailOtp(
    db,
    { challengeId: args.challengeId, code: args.code },
    { distinguishExpired: true },
  );
  await assertEmailFree(db, email, args);

  const { nexusIdentities } = getIdentityDomainCollections(db);
  const now = new Date();
  const previous = await nexusIdentities.findOne(
    { nexusIdentityId: args.nexusIdentityId },
    { projection: { normalizedEmail: 1 } },
  );
  try {
    await nexusIdentities.updateOne(
      { nexusIdentityId: args.nexusIdentityId },
      { $set: { normalizedEmail: email, emailVerifiedAt: now, updatedAt: now } },
    );
  } catch (e) {
    if (e instanceof Error && e.message.includes('duplicate')) {
      throw new EmailAttachError('email_in_use');
    }
    throw e;
  }
  try {
    await prisma.user.update({
      where: { id: args.prismaUserId },
      data: { email, emailVerified: true },
    });
  } catch (e) {
    // Roll the identity back so Mongo and Prisma never disagree on the email.
    if (previous?.normalizedEmail) {
      await nexusIdentities.updateOne(
        { nexusIdentityId: args.nexusIdentityId },
        { $set: { normalizedEmail: previous.normalizedEmail, updatedAt: new Date() } },
      ).catch(() => undefined);
    }
    const code = (e as { code?: string }).code;
    if (code === 'P2002') throw new EmailAttachError('email_in_use');
    throw e;
  }
  return { email };
}
