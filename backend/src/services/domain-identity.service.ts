/**
 * Synchronizes login users into MongoDB domain identity records.
 * PostgreSQL remains login compatibility, while MongoDB owns NEXUS identity.
 */
import { randomUUID } from 'crypto';
import { getMongoDb } from '../config/mongo';
import { normalizeEmail } from '../config/platform-admins';
import { getIdentityDomainCollections, type AuthProvider, type NexusIdentityDocument } from '../models/domain';

export interface LoginUserIdentityInput {
  id: string;
  email: string;
  fullName: string;
  provider?: string;
}

export interface SyncedDomainIdentity {
  nexusIdentityId: string;
  normalizedEmail: string;
}

/**
 * Maps the legacy Prisma auth provider into the domain auth provider.
 * Input: provider value from Prisma login user.
 * Output: domain auth provider value used by NexusIdentity.
 */
function mapAuthProvider(provider: string | undefined): AuthProvider {
  if (provider === 'GOOGLE') return 'google';
  return 'email_password';
}

/**
 * Builds a new NexusIdentity document from trusted login user data.
 * Input: legacy login user, normalized email, and creation timestamp.
 * Output: MongoDB domain identity document ready for upsert.
 */
function buildNexusIdentityDocument(
  user: LoginUserIdentityInput,
  normalizedEmail: string,
  now: Date,
): NexusIdentityDocument {
  return {
    nexusIdentityId: `identity_${randomUUID()}`,
    normalizedEmail,
    displayName: user.fullName,
    authProvider: mapAuthProvider(user.provider),
    status: 'active',
    locale: 'he',
    prismaUserId: user.id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Ensures the login user has a domain NexusIdentity and email ContactProfile.
 * Input: trusted Prisma login user fields.
 * Output: domain identity id and normalized email.
 */
export async function syncDomainIdentityForLoginUser(user: LoginUserIdentityInput): Promise<SyncedDomainIdentity> {
  const db = await getMongoDb();
  const collections = getIdentityDomainCollections(db);
  const normalizedEmail = normalizeEmail(user.email);

  // Fast path: this sync runs on every /api/me and /api/v1/wallet/me request.
  // When the identity and contact profile already reflect this login user,
  // the three sequential upserts below are pure no-op writes - skip them for
  // two parallel reads instead. Any mismatch (new user, provider change,
  // relinked prisma id, email casing change) falls through to the full sync.
  const [existingIdentity, existingProfile] = await Promise.all([
    collections.nexusIdentities.findOne(
      { normalizedEmail },
      { projection: { nexusIdentityId: 1, normalizedEmail: 1, authProvider: 1, status: 1, prismaUserId: 1 } },
    ),
    collections.contactProfiles.findOne(
      { channel: 'email', normalizedIdentifier: normalizedEmail },
      { projection: { nexusIdentityId: 1, identifier: 1 } },
    ),
  ]);
  if (
    existingIdentity &&
    existingIdentity.status === 'active' &&
    existingIdentity.prismaUserId === user.id &&
    existingIdentity.authProvider === mapAuthProvider(user.provider) &&
    existingProfile?.nexusIdentityId === existingIdentity.nexusIdentityId &&
    existingProfile.identifier === user.email
  ) {
    return {
      nexusIdentityId: existingIdentity.nexusIdentityId,
      normalizedEmail: existingIdentity.normalizedEmail,
    };
  }

  const now = new Date();
  const identityOnInsert = buildNexusIdentityDocument(user, normalizedEmail, now);

  await collections.nexusIdentities.updateOne(
    { normalizedEmail },
    {
      $setOnInsert: {
        nexusIdentityId: identityOnInsert.nexusIdentityId,
        normalizedEmail: identityOnInsert.normalizedEmail,
        locale: identityOnInsert.locale,
        createdAt: identityOnInsert.createdAt,
        // Seed displayName from the login (Google/Prisma) full name ONLY at
        // creation. After that the wallet profile owns NexusIdentity.displayName
        // (set by patchWalletProfile). This sync runs on every /api/me + tenant
        // context resolve; re-$set-ing displayName here would clobber a
        // wallet-edited name back to the login name on the next request.
        displayName: user.fullName,
      },
      $set: {
        authProvider: mapAuthProvider(user.provider),
        status: 'active',
        prismaUserId: user.id,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  const identity = await collections.nexusIdentities.findOne(
    { normalizedEmail },
    { projection: { nexusIdentityId: 1, normalizedEmail: 1 } },
  );
  if (!identity) {
    throw new Error('Domain identity sync failed after upsert');
  }

  await collections.contactProfiles.updateOne(
    { channel: 'email', normalizedIdentifier: normalizedEmail },
    {
      $setOnInsert: {
        contactProfileId: `contact_${randomUUID()}`,
        channel: 'email',
        normalizedIdentifier: normalizedEmail,
        verified: false,
        status: 'active',
        source: 'login_user_sync',
        createdAt: now,
      },
      $set: {
        nexusIdentityId: identity.nexusIdentityId,
        identifier: user.email,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  return {
    nexusIdentityId: identity.nexusIdentityId,
    normalizedEmail: identity.normalizedEmail,
  };
}

/**
 * Creates or links a domain identity for a tenant member invitation.
 * Input: invited email and optional display name from tenant admin.
 * Output: domain identity id and normalized email for member onboarding.
 */
export async function syncDomainIdentityForMemberInvite(input: {
  email: string;
  displayName?: string;
}): Promise<SyncedDomainIdentity> {
  const db = await getMongoDb();
  const collections = getIdentityDomainCollections(db);
  const normalizedEmail = normalizeEmail(input.email);
  const now = new Date();

  await collections.nexusIdentities.updateOne(
    { normalizedEmail },
    {
      $setOnInsert: {
        nexusIdentityId: `identity_${randomUUID()}`,
        normalizedEmail,
        authProvider: 'email_passwordless',
        status: 'invited',
        locale: 'he',
        createdAt: now,
      },
      $set: {
        ...(input.displayName ? { displayName: input.displayName } : {}),
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  const identity = await collections.nexusIdentities.findOne(
    { normalizedEmail },
    { projection: { nexusIdentityId: 1, normalizedEmail: 1 } },
  );
  if (!identity) {
    throw new Error('Domain invite identity sync failed after upsert');
  }

  await collections.contactProfiles.updateOne(
    { channel: 'email', normalizedIdentifier: normalizedEmail },
    {
      $setOnInsert: {
        contactProfileId: `contact_${randomUUID()}`,
        channel: 'email',
        normalizedIdentifier: normalizedEmail,
        verified: false,
        status: 'active',
        source: 'member_admin_invite',
        createdAt: now,
      },
      $set: {
        nexusIdentityId: identity.nexusIdentityId,
        identifier: input.email,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  return {
    nexusIdentityId: identity.nexusIdentityId,
    normalizedEmail: identity.normalizedEmail,
  };
}
