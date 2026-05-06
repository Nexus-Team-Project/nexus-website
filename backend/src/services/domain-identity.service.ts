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
  const now = new Date();
  const identityOnInsert = buildNexusIdentityDocument(user, normalizedEmail, now);

  await collections.nexusIdentities.updateOne(
    { normalizedEmail },
    {
      $setOnInsert: identityOnInsert,
      $set: {
        displayName: user.fullName,
        authProvider: mapAuthProvider(user.provider),
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
        nexusIdentityId: identity.nexusIdentityId,
        channel: 'email',
        identifier: user.email,
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
