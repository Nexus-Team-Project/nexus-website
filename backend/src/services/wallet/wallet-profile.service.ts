/**
 * Wallet profile lifecycle: read / patch the NexusIdentity.profile
 * sub-doc + write the marketingConsent audit-trail field. Used by
 * /api/v1/wallet/profile and /api/v1/wallet/marketing-consent.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 4.1, 6
 */
import { Db } from 'mongodb';
import { getIdentityDomainCollections } from '../../models/domain';
import type {
  WalletProfilePatchInput,
  WalletMarketingConsentInput,
} from '../../schemas/wallet-profile.schemas';
import { syncWalletProfileToTenants } from './wallet-profile-sync.service';

const normalize = (e: string): string => e.trim().toLowerCase();

/** What the GET handler returns. Mirrors the stored profile shape. */
export interface WalletProfileView {
  firstName?: string;
  lastName?: string;
  birthday?: string;
  gender?: string;
  lifeStage?: string;
  motivation?: string;
  purpose?: string[];
  inviteFriendsSent?: number;
  completedAt?: string;
  updatedAt?: string;
}

/**
 * Read the wallet profile for a given Prisma user (looked up via the
 * paired NexusIdentity). Returns null when the identity has no profile
 * sub-doc yet.
 */
export async function getWalletProfile(
  db: Db,
  args: { prismaUserId: string; email: string },
): Promise<WalletProfileView | null> {
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const identity = await nexusIdentities.findOne(
    { normalizedEmail: normalize(args.email) },
    { projection: { profile: 1 } },
  );
  if (!identity?.profile) return null;
  const p = identity.profile;
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    birthday: p.birthday instanceof Date ? p.birthday.toISOString() : undefined,
    gender: p.gender,
    lifeStage: p.lifeStage,
    motivation: p.motivation,
    purpose: p.purpose,
    inviteFriendsSent: p.inviteFriendsSent,
    completedAt: p.completedAt instanceof Date ? p.completedAt.toISOString() : undefined,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : undefined,
  };
}

/**
 * Patch the wallet profile. Accepts any subset of fields plus an
 * optional `complete: true` to stamp completedAt (gates the slide chain
 * for returning users). Always bumps updatedAt.
 */
export async function patchWalletProfile(
  db: Db,
  args: { prismaUserId: string; email: string; patch: WalletProfilePatchInput },
): Promise<WalletProfileView> {
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const now = new Date();
  const set: Record<string, unknown> = { 'profile.updatedAt': now };

  if (args.patch.firstName !== undefined) set['profile.firstName'] = args.patch.firstName;
  if (args.patch.lastName !== undefined) set['profile.lastName'] = args.patch.lastName;
  if (args.patch.birthday !== undefined) set['profile.birthday'] = new Date(args.patch.birthday);
  if (args.patch.gender !== undefined) set['profile.gender'] = args.patch.gender;
  if (args.patch.lifeStage !== undefined) set['profile.lifeStage'] = args.patch.lifeStage;
  if (args.patch.motivation !== undefined) set['profile.motivation'] = args.patch.motivation;
  if (args.patch.purpose !== undefined) set['profile.purpose'] = args.patch.purpose;
  if (args.patch.inviteFriendsSent !== undefined) set['profile.inviteFriendsSent'] = args.patch.inviteFriendsSent;
  if (args.patch.complete === true) set['profile.completedAt'] = now;

  await nexusIdentities.updateOne(
    { normalizedEmail: normalize(args.email) },
    { $set: set },
  );

  // Mirror the updated answers into every tenant the user is an active member of.
  // Best-effort: a sync hiccup must never fail the profile save.
  try {
    const idDoc = await nexusIdentities.findOne(
      { normalizedEmail: normalize(args.email) },
      { projection: { nexusIdentityId: 1 } },
    );
    if (idDoc?.nexusIdentityId) {
      await syncWalletProfileToTenants(db, idDoc.nexusIdentityId);
    }
  } catch (err) {
    console.error('[wallet-profile] mirror sync failed (non-fatal):', err);
  }

  const view = await getWalletProfile(db, args);
  return view ?? { updatedAt: now.toISOString() };
}

/**
 * Write the marketing-consent audit-trail object. Preserves grantedAt
 * on subsequent toggles (only updatedAt advances) so the audit shows
 * when the user first opted in.
 */
export async function setWalletMarketingConsent(
  db: Db,
  args: {
    prismaUserId: string;
    email: string;
    body: WalletMarketingConsentInput;
    ip?: string;
  },
): Promise<void> {
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const identity = await nexusIdentities.findOne(
    { normalizedEmail: normalize(args.email) },
    { projection: { marketingConsent: 1 } },
  );
  const now = new Date();
  const grantedAt = identity?.marketingConsent?.grantedAt ?? now;
  await nexusIdentities.updateOne(
    { normalizedEmail: normalize(args.email) },
    {
      $set: {
        marketingConsent: {
          granted: args.body.granted,
          grantedAt,
          updatedAt: now,
          source: args.body.source,
          ...(args.ip ? { ipAtGrant: args.ip } : {}),
        },
      },
    },
  );
}
