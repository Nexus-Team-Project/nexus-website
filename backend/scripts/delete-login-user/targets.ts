/**
 * Purpose: Resolve MongoDB ids linked to one Nexus user email.
 *
 * This module only discovers targets. Count and delete operations live in the
 * Mongo cleanup module so destructive logic stays separate from lookup logic.
 */
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../src/config/mongo';
import { getIdentityDomainCollections } from '../../src/models/domain/identity.models';
import { getOrchestrationDomainCollections } from '../../src/models/domain/orchestration.models';
import { getTenantDomainCollections } from '../../src/models/domain/tenant.models';
import { getOnboardingCollections } from '../../src/models/onboarding.models';
import type {
  MongoDeletionTargets,
  OrchestrationDeletionTargets,
  PrismaUserSnapshot,
} from './types';

/**
 * Builds the Mongo identity lookup for a person.
 *
 * Inputs:
 * - email: normalized email.
 * - prismaUser: optional Prisma user snapshot from PostgreSQL.
 *
 * Output:
 * - Identity ids and Prisma user ids found in Mongo.
 */
export async function resolveMongoPerson(email: string, prismaUser: PrismaUserSnapshot) {
  const db = await getMongoDb();
  const identityCollections = getIdentityDomainCollections(db);

  const identityMatches = await identityCollections.nexusIdentities
    .find({
      $or: [
        { normalizedEmail: email },
        ...(prismaUser ? [{ prismaUserId: prismaUser.id }] : []),
      ],
    })
    .project<{ nexusIdentityId: string; prismaUserId?: string }>({
      nexusIdentityId: 1,
      prismaUserId: 1,
    })
    .toArray();

  const contactMatches = await identityCollections.contactProfiles
    .find({ channel: 'email', normalizedIdentifier: email })
    .project<{ nexusIdentityId: string }>({ nexusIdentityId: 1 })
    .toArray();

  const nexusIdentityIds = new Set<string>();
  const prismaUserIds = new Set<string>();

  for (const identity of identityMatches) {
    nexusIdentityIds.add(identity.nexusIdentityId);
    if (identity.prismaUserId) prismaUserIds.add(identity.prismaUserId);
  }

  for (const contact of contactMatches) {
    nexusIdentityIds.add(contact.nexusIdentityId);
  }

  if (prismaUser) prismaUserIds.add(prismaUser.id);

  return {
    nexusIdentityIds: [...nexusIdentityIds],
    prismaUserIds: [...prismaUserIds],
  };
}

/**
 * Finds Mongo tenant and member ids linked to a person.
 *
 * Inputs:
 * - email: normalized email.
 * - prismaUser: optional Prisma user snapshot.
 *
 * Output:
 * - Mongo ids needed for count and delete operations.
 */
export async function resolveMongoDeletionTargets(
  email: string,
  prismaUser: PrismaUserSnapshot,
): Promise<MongoDeletionTargets> {
  const db = await getMongoDb();
  const onboarding = getOnboardingCollections(db);
  const tenants = getTenantDomainCollections(db);
  const person = await resolveMongoPerson(email, prismaUser);

  const domainOwnedTenants = person.nexusIdentityIds.length
    ? await tenants.domainTenants
      .find({ createdByIdentityId: { $in: person.nexusIdentityIds } })
      .project<{ tenantId: string }>({ tenantId: 1 })
      .toArray()
    : [];

  const domainMembers = person.nexusIdentityIds.length
    ? await tenants.tenantMembers
      .find({ nexusIdentityId: { $in: person.nexusIdentityIds } })
      .project<{ tenantMemberId: string; tenantId: string }>({ tenantMemberId: 1, tenantId: 1 })
      .toArray()
    : [];

  const legacyOwnedTenants = person.prismaUserIds.length
    ? await onboarding.tenants
      .find({ createdByUserId: { $in: person.prismaUserIds } })
      .project<{ _id: ObjectId }>({ _id: 1 })
      .toArray()
    : [];

  const legacyMemberships = await onboarding.tenantMembers
    .find({
      $or: [
        { email },
        ...(person.prismaUserIds.length ? [{ userId: { $in: person.prismaUserIds } }] : []),
      ],
    })
    .project<{ tenantId: ObjectId }>({ tenantId: 1 })
    .toArray();

  return {
    ...person,
    domainOwnedTenantIds: [...new Set(domainOwnedTenants.map((tenant) => tenant.tenantId))],
    domainTenantMemberIds: [...new Set(domainMembers.map((member) => member.tenantMemberId))],
    domainMemberTenantIds: [...new Set(domainMembers.map((member) => member.tenantId))],
    legacyOwnedTenantIds: legacyOwnedTenants.map((tenant) => tenant._id),
    legacyMemberTenantIds: [...new Set(legacyMemberships.map((member) => member.tenantId.toHexString()))],
  };
}

/**
 * Finds saga and event ids linked to a deleted user, member, or owned tenant.
 *
 * Inputs:
 * - targets: resolved Mongo user, member, and tenant ids.
 *
 * Output:
 * - Platform event ids and saga instance ids to remove.
 */
export async function resolveOrchestrationDeletionTargets(
  targets: MongoDeletionTargets,
): Promise<OrchestrationDeletionTargets> {
  const db = await getMongoDb();
  const orchestration = getOrchestrationDomainCollections(db);

  const platformEvents = await orchestration.platformEvents
    .find({
      $or: [
        { 'authorizationContext.nexusIdentityId': { $in: targets.nexusIdentityIds } },
        { 'authorizationContext.tenantId': { $in: targets.domainOwnedTenantIds } },
        { 'payload.nexusIdentityId': { $in: targets.nexusIdentityIds } },
        { 'payload.tenantId': { $in: targets.domainOwnedTenantIds } },
      ],
    })
    .project<{ platformEventId: string }>({ platformEventId: 1 })
    .toArray();

  const sagaInstances = await orchestration.sagaInstances
    .find({
      $or: [
        { tenantId: { $in: targets.domainOwnedTenantIds } },
        { memberId: { $in: targets.domainTenantMemberIds } },
      ],
    })
    .project<{ sagaInstanceId: string }>({ sagaInstanceId: 1 })
    .toArray();

  return {
    platformEventIds: platformEvents.map((event) => event.platformEventId),
    sagaInstanceIds: sagaInstances.map((saga) => saga.sagaInstanceId),
  };
}
