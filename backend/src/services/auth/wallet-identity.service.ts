/**
 * Wallet-side helper that resolves an email (and optional verified
 * phone) into a paired (Prisma User, NexusIdentity) row set. Used by
 * email-OTP/verify and google/wallet to guarantee that every wallet
 * session is backed by both a Prisma row (for refresh tokens) and a
 * Mongo NexusIdentity (for domain context).
 *
 * Rules:
 * - If a Prisma User exists by email, reuse it. Otherwise create one
 *   with a placeholder fullName derived from the email local-part;
 *   the wallet onboarding slides overwrite this later.
 * - If a NexusIdentity exists by normalizedEmail, reuse it. Otherwise
 *   create one and link prismaUserId.
 * - If a verified phone is supplied, set phone + phoneVerifiedAt on
 *   the identity (only if not already set) and clear stale tenant
 *   phone fields belonging to other identities.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 10.2 and 10.3
 */
import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { getMongoDb } from '../../config/mongo';
import { getIdentityDomainCollections } from '../../models/domain';
import type { NexusIdentityDocument } from '../../models/domain/identity.models';
import { clearStalePhoneEntries } from './phone-collision.service';

const normalizeEmail = (e: string): string => e.trim().toLowerCase();

/** What the caller needs to mint a wallet session. */
export interface ResolvedWalletIdentity {
  prismaUserId: string;
  email: string;
  role: string;
  identityCreated: boolean;
  phoneLinked: boolean;
}

/**
 * Find or create a Prisma user + NexusIdentity for the given verified
 * email, optionally attaching a verified phone.
 *
 * @param args.email already-verified email (we trust it - caller did OTP)
 * @param args.verifiedPhone canonical phone if the wallet flow proved it,
 *   else null. When set, the phone is attached to the identity and stale
 *   tenant phone fields are cleared.
 * @param args.displayName optional name (e.g. from Google profile)
 * @param args.avatarUrl optional Google profile photo URL. Stored on the Prisma
 *   user (the wallet TopBar + auth-flow hero render it). Set on create and
 *   refreshed on login; a null/empty value never overwrites an existing photo.
 */
export async function resolveWalletIdentity(args: {
  email: string;
  verifiedPhone: string | null;
  displayName?: string;
  avatarUrl?: string | null;
}): Promise<ResolvedWalletIdentity> {
  const email = normalizeEmail(args.email);
  const fallbackName = args.displayName?.trim() || deriveNameFromEmail(email);
  const incomingAvatar = args.avatarUrl?.trim() || null;

  // 1) Prisma user upsert.
  let prismaUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, avatarUrl: true },
  });
  if (!prismaUser) {
    const created = await prisma.user.create({
      data: {
        email,
        emailVerified: true,
        fullName: fallbackName,
        provider: 'EMAIL',
        avatarUrl: incomingAvatar,
      },
      select: { id: true, email: true, role: true, avatarUrl: true },
    });
    prismaUser = created;
  } else if (incomingAvatar && incomingAvatar !== prismaUser.avatarUrl) {
    // Keep the Google photo fresh on each login; never clobber a stored photo
    // with null (an account that has no picture this time keeps the old one).
    await prisma.user.update({ where: { id: prismaUser.id }, data: { avatarUrl: incomingAvatar } });
  }

  // 2) NexusIdentity upsert.
  const db = await getMongoDb();
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const now = new Date();
  let identity = await nexusIdentities.findOne({ normalizedEmail: email });
  let identityCreated = false;
  if (!identity) {
    const newDoc: NexusIdentityDocument = {
      nexusIdentityId: `identity_${randomUUID()}`,
      normalizedEmail: email,
      displayName: fallbackName,
      authProvider: 'email_password',
      status: 'active',
      locale: 'he',
      prismaUserId: prismaUser.id,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await nexusIdentities.insertOne(newDoc);
    identity = await nexusIdentities.findOne({ normalizedEmail: email });
    identityCreated = true;
  }
  if (!identity) throw new Error('identity_upsert_failed');

  // 3) Phone attach + collision cleanup.
  let phoneLinked = false;
  if (args.verifiedPhone && identity.phone !== args.verifiedPhone) {
    await nexusIdentities.updateOne(
      { _id: identity._id },
      { $set: { phone: args.verifiedPhone, phoneVerifiedAt: now, updatedAt: now } },
    );
    await clearStalePhoneEntries(db, args.verifiedPhone, identity.nexusIdentityId);
    phoneLinked = true;
  } else if (!identityCreated && !identity.emailVerifiedAt) {
    await nexusIdentities.updateOne(
      { _id: identity._id },
      { $set: { emailVerifiedAt: now, updatedAt: now } },
    );
  }

  return {
    prismaUserId: prismaUser.id,
    email: prismaUser.email,
    role: prismaUser.role,
    identityCreated,
    phoneLinked,
  };
}

/** Use the email local-part as a humane fallback display name. */
function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'user';
  return local.charAt(0).toUpperCase() + local.slice(1);
}
