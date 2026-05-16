/**
 * Purpose: Count and delete MongoDB rows linked to one Nexus user email.
 *
 * This module covers legacy onboarding collections and newer domain
 * collections. It intentionally does not delete global role permission maps.
 */
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../src/config/mongo';
import { getIdentityDomainCollections } from '../../src/models/domain/identity.models';
import { getOrchestrationDomainCollections } from '../../src/models/domain/orchestration.models';
import { getSupplyDomainCollections } from '../../src/models/domain/supply.models';
import { getTenantDomainCollections } from '../../src/models/domain/tenant.models';
import { getOnboardingCollections } from '../../src/models/onboarding.models';
import { deleteOfferImage } from '../../src/utils/cloudinary';
import {
  resolveMongoDeletionTargets,
  resolveOrchestrationDeletionTargets,
} from './targets';
import type { DeletionCounts, MongoDeletionTargets, PrismaUserSnapshot } from './types';

/**
 * Returns legacy member tenant ids that are not owned by the deleted user.
 *
 * Inputs:
 * - targets: resolved legacy tenant targets.
 *
 * Output:
 * - ObjectIds for memberships to remove without deleting the tenant itself.
 */
function getLegacyMemberOnlyTenantIds(targets: MongoDeletionTargets): ObjectId[] {
  const ownedTenantIdStrings = new Set(targets.legacyOwnedTenantIds.map((tenantId) => tenantId.toHexString()));
  return targets.legacyMemberTenantIds
    .filter((tenantId) => !ownedTenantIdStrings.has(tenantId))
    .map((tenantId) => new ObjectId(tenantId));
}

/**
 * Counts Mongo rows that will be removed for one person.
 *
 * Inputs:
 * - email: normalized email.
 * - prismaUser: optional Prisma user snapshot.
 *
 * Output:
 * - Count map grouped by Mongo collection and delete reason.
 */
export async function collectMongoCounts(
  email: string,
  prismaUser: PrismaUserSnapshot,
): Promise<DeletionCounts> {
  const db = await getMongoDb();
  const identity = getIdentityDomainCollections(db);
  const tenants = getTenantDomainCollections(db);
  const supply = getSupplyDomainCollections(db);
  const orchestration = getOrchestrationDomainCollections(db);
  const onboarding = getOnboardingCollections(db);
  const targets = await resolveMongoDeletionTargets(email, prismaUser);
  const orchestrationTargets = await resolveOrchestrationDeletionTargets(targets);
  const legacyMemberOnlyTenantIds = getLegacyMemberOnlyTenantIds(targets);

  const [
    nexusIdentities,
    contactProfiles,
    tenantUserRoles,
    tenantUserRolesForOwnedTenants,
    tenantMembersV2,
    tenantMembersV2ForOwnedTenants,
    tenantMemberInvitations,
    memberGroupAssignments,
    memberGroupAssignmentsForOwnedTenants,
    domainTenants,
    tenantOnboardingStates,
    tenantProfiles,
    tenantServiceActivations,
    memberGroups,
    tenantCatalogPolicies,
    tenantContacts,
    legacyTenants,
    legacyTenantMembersByPerson,
    legacyTenantMembersForOwnedTenants,
    legacyMembers,
    legacyOnboardingStates,
    legacyBusinessSetups,
    platformEvents,
    consumedEvents,
    sagaInstances,
    processedSteps,
    nexusOffers,
    tenantOfferConfigs,
  ] = await Promise.all([
    identity.nexusIdentities.countDocuments({
      $or: [
        { normalizedEmail: email },
        ...(targets.prismaUserIds.length ? [{ prismaUserId: { $in: targets.prismaUserIds } }] : []),
      ],
    }),
    identity.contactProfiles.countDocuments({
      $or: [
        { normalizedIdentifier: email },
        ...(targets.nexusIdentityIds.length ? [{ nexusIdentityId: { $in: targets.nexusIdentityIds } }] : []),
      ],
    }),
    identity.tenantUserRoles.countDocuments({
      nexusIdentityId: { $in: targets.nexusIdentityIds },
      tenantId: { $nin: targets.domainOwnedTenantIds },
    }),
    identity.tenantUserRoles.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.tenantMembers.countDocuments({
      nexusIdentityId: { $in: targets.nexusIdentityIds },
      tenantId: { $nin: targets.domainOwnedTenantIds },
    }),
    tenants.tenantMembers.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.tenantMemberInvitations.countDocuments({
      $or: [
        { normalizedEmail: email },
        { invitedEmail: email },
        ...(targets.nexusIdentityIds.length ? [{ nexusIdentityId: { $in: targets.nexusIdentityIds } }] : []),
        ...(targets.domainTenantMemberIds.length ? [{ tenantMemberId: { $in: targets.domainTenantMemberIds } }] : []),
        ...(targets.domainOwnedTenantIds.length ? [{ tenantId: { $in: targets.domainOwnedTenantIds } }] : []),
      ],
    }),
    tenants.memberGroupAssignments.countDocuments({
      tenantMemberId: { $in: targets.domainTenantMemberIds },
      tenantId: { $nin: targets.domainOwnedTenantIds },
    }),
    tenants.memberGroupAssignments.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.domainTenants.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.tenantOnboardingStates.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.tenantProfiles.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.tenantServiceActivations.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.memberGroups.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.tenantCatalogPolicies.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    tenants.tenantContacts.countDocuments({
      $or: [
        { normalizedEmail: email },
        ...(targets.domainOwnedTenantIds.length ? [{ tenantId: { $in: targets.domainOwnedTenantIds } }] : []),
      ],
    }),
    onboarding.tenants.countDocuments({ _id: { $in: targets.legacyOwnedTenantIds } }),
    onboarding.tenantMembers.countDocuments({
      $or: [
        { email },
        ...(targets.prismaUserIds.length ? [{ userId: { $in: targets.prismaUserIds } }] : []),
      ],
      tenantId: { $in: legacyMemberOnlyTenantIds },
    }),
    onboarding.tenantMembers.countDocuments({ tenantId: { $in: targets.legacyOwnedTenantIds } }),
    onboarding.members.countDocuments({
      $or: [
        { email },
        ...(targets.prismaUserIds.length ? [{ userId: { $in: targets.prismaUserIds } }] : []),
      ],
    }),
    onboarding.onboardingStates.countDocuments({
      $or: [
        ...(targets.prismaUserIds.length ? [{ userId: { $in: targets.prismaUserIds } }] : []),
        { tenantId: { $in: targets.legacyOwnedTenantIds } },
      ],
    }),
    onboarding.businessSetups.countDocuments({ tenantId: { $in: targets.legacyOwnedTenantIds } }),
    orchestration.platformEvents.countDocuments({
      platformEventId: { $in: orchestrationTargets.platformEventIds },
    }),
    orchestration.consumedEvents.countDocuments({
      platformEventId: { $in: orchestrationTargets.platformEventIds },
    }),
    orchestration.sagaInstances.countDocuments({
      sagaInstanceId: { $in: orchestrationTargets.sagaInstanceIds },
    }),
    orchestration.processedSteps.countDocuments({
      sagaInstanceId: { $in: orchestrationTargets.sagaInstanceIds },
    }),
    // Offers created by the tenant (platform offers uploaded by this admin/owner).
    supply.nexusOffers.countDocuments({
      createdByTenantId: { $in: targets.domainOwnedTenantIds },
    }),
    // Adoption records for the tenant (offers this tenant adopted from the platform catalog).
    supply.tenantOfferConfigs.countDocuments({
      tenantId: { $in: targets.domainOwnedTenantIds },
    }),
  ]);

  return {
    nexusIdentities,
    contactProfiles,
    tenantUserRoles,
    tenantUserRolesForOwnedTenants,
    tenantMembersV2,
    tenantMembersV2ForOwnedTenants,
    tenantMemberInvitations,
    memberGroupAssignments,
    memberGroupAssignmentsForOwnedTenants,
    domainTenants,
    tenantOnboardingStates,
    tenantProfiles,
    tenantServiceActivations,
    memberGroups,
    tenantCatalogPolicies,
    tenantContacts,
    legacyTenants,
    legacyTenantMembersByPerson,
    legacyTenantMembersForOwnedTenants,
    legacyMembers,
    legacyOnboardingStates,
    legacyBusinessSetups,
    platformEvents,
    consumedEvents,
    sagaInstances,
    processedSteps,
    nexusOffers,
    tenantOfferConfigs,
  };
}

/**
 * Deletes Mongo domain and legacy onboarding rows for one person.
 *
 * Inputs:
 * - email: normalized email.
 * - prismaUser: optional Prisma user snapshot.
 *
 * Output:
 * - No return value. Throws if Mongo deletion fails.
 */
export async function deleteMongoUser(email: string, prismaUser: PrismaUserSnapshot): Promise<void> {
  const db = await getMongoDb();
  const identity = getIdentityDomainCollections(db);
  const tenants = getTenantDomainCollections(db);
  const supply = getSupplyDomainCollections(db);
  const orchestration = getOrchestrationDomainCollections(db);
  const onboarding = getOnboardingCollections(db);
  const targets = await resolveMongoDeletionTargets(email, prismaUser);
  const orchestrationTargets = await resolveOrchestrationDeletionTargets(targets);
  const legacyMemberOnlyTenantIds = getLegacyMemberOnlyTenantIds(targets);

  await orchestration.consumedEvents.deleteMany({ platformEventId: { $in: orchestrationTargets.platformEventIds } });
  await orchestration.platformEvents.deleteMany({ platformEventId: { $in: orchestrationTargets.platformEventIds } });
  await orchestration.processedSteps.deleteMany({ sagaInstanceId: { $in: orchestrationTargets.sagaInstanceIds } });
  await orchestration.sagaInstances.deleteMany({ sagaInstanceId: { $in: orchestrationTargets.sagaInstanceIds } });

  await tenants.memberGroupAssignments.deleteMany({
    $or: [
      { tenantMemberId: { $in: targets.domainTenantMemberIds } },
      { tenantId: { $in: targets.domainOwnedTenantIds } },
    ],
  });
  await tenants.tenantMembers.deleteMany({
    $or: [
      { nexusIdentityId: { $in: targets.nexusIdentityIds } },
      { tenantId: { $in: targets.domainOwnedTenantIds } },
    ],
  });
  await tenants.tenantMemberInvitations.deleteMany({
    $or: [
      { normalizedEmail: email },
      { invitedEmail: email },
      ...(targets.nexusIdentityIds.length ? [{ nexusIdentityId: { $in: targets.nexusIdentityIds } }] : []),
      ...(targets.domainTenantMemberIds.length ? [{ tenantMemberId: { $in: targets.domainTenantMemberIds } }] : []),
      ...(targets.domainOwnedTenantIds.length ? [{ tenantId: { $in: targets.domainOwnedTenantIds } }] : []),
    ],
  });
  await identity.tenantUserRoles.deleteMany({
    $or: [
      { nexusIdentityId: { $in: targets.nexusIdentityIds } },
      { tenantId: { $in: targets.domainOwnedTenantIds } },
    ],
  });
  // Delete adoption records (tenant chose to show these platform offers to members).
  await supply.tenantOfferConfigs.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  // Collect image URLs before deleting offer documents so we can clean up Cloudinary.
  const offersToDelete = await supply.nexusOffers
    .find(
      { createdByTenantId: { $in: targets.domainOwnedTenantIds } },
      { projection: { imageUrl: 1 } },
    )
    .toArray();
  await supply.nexusOffers.deleteMany({ createdByTenantId: { $in: targets.domainOwnedTenantIds } });
  // Delete Cloudinary images after DB rows are gone. Errors are swallowed per deleteOfferImage contract.
  await Promise.all(
    offersToDelete
      .filter((o) => o.imageUrl)
      .map((o) => deleteOfferImage(o.imageUrl as string)),
  );
  await tenants.tenantCatalogPolicies.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  await tenants.memberGroups.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  await tenants.tenantServiceActivations.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  await tenants.tenantProfiles.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  await tenants.tenantOnboardingStates.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  // Delete contacts by person email (across all tenants) and all contacts for tenants the person owned.
  await tenants.tenantContacts.deleteMany({
    $or: [
      { normalizedEmail: email },
      ...(targets.domainOwnedTenantIds.length ? [{ tenantId: { $in: targets.domainOwnedTenantIds } }] : []),
    ],
  });
  await tenants.domainTenants.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });

  await onboarding.businessSetups.deleteMany({ tenantId: { $in: targets.legacyOwnedTenantIds } });
  await onboarding.tenantMembers.deleteMany({
    $or: [
      { tenantId: { $in: targets.legacyOwnedTenantIds } },
      {
        $and: [
          { tenantId: { $in: legacyMemberOnlyTenantIds } },
          {
            $or: [
              { email },
              ...(targets.prismaUserIds.length ? [{ userId: { $in: targets.prismaUserIds } }] : []),
            ],
          },
        ],
      },
    ],
  });
  await onboarding.members.deleteMany({
    $or: [
      { email },
      ...(targets.prismaUserIds.length ? [{ userId: { $in: targets.prismaUserIds } }] : []),
    ],
  });
  await onboarding.onboardingStates.deleteMany({
    $or: [
      ...(targets.prismaUserIds.length ? [{ userId: { $in: targets.prismaUserIds } }] : []),
      { tenantId: { $in: targets.legacyOwnedTenantIds } },
    ],
  });
  await onboarding.tenants.deleteMany({ _id: { $in: targets.legacyOwnedTenantIds } });

  await identity.contactProfiles.deleteMany({
    $or: [
      { normalizedIdentifier: email },
      { nexusIdentityId: { $in: targets.nexusIdentityIds } },
    ],
  });
  await identity.nexusIdentities.deleteMany({
    $or: [
      { normalizedEmail: email },
      ...(targets.prismaUserIds.length ? [{ prismaUserId: { $in: targets.prismaUserIds } }] : []),
      { nexusIdentityId: { $in: targets.nexusIdentityIds } },
    ],
  });
}
