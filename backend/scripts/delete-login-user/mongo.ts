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
import { getVoucherCodeCollection } from '../../src/models/domain/voucher-codes.models';
import { getTenantDomainCollections } from '../../src/models/domain/tenant.models';
import { getInviteJobCollections } from '../../src/models/domain/invite-jobs.models';
import { getOnboardingCollections } from '../../src/models/onboarding.models';
import { deleteOfferImage } from '../../src/utils/cloudinary';
import { PHONE_OTP_COLLECTION } from '../../src/models/auth/phone-otp.models';
import { EMAIL_OTP_COLLECTION } from '../../src/models/auth/email-otp.models';
import { PHONE_SIGNUP_TICKET_COLLECTION } from '../../src/models/auth/phone-signup-ticket.models';
import { TENANT_JOIN_REQUEST_COLLECTION } from '../../src/models/auth/tenant-join-request.models';
import {
  resolveMongoDeletionTargets,
  resolveOrchestrationDeletionTargets,
} from './targets';
import type { DeletionCounts, MongoDeletionTargets, PrismaUserSnapshot } from './types';

/** Collection name for the wallet rate-limit token-bucket markers. */
const WALLET_RATE_LIMIT_COLLECTION = 'walletRateLimits';

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
  const voucherCodesCol = getVoucherCodeCollection(db);
  const inviteJobs = getInviteJobCollections(db);
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
    voucherCodes,
    tenantContactFields,
    memberInviteJobs,
    memberInviteJobItems,
    phoneOtpChallenges,
    emailOtpChallenges,
    phoneSignupTickets,
    walletRateLimits,
    tenantJoinRequestsByUser,
    tenantJoinRequestsForOwnedTenants,
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
    // Voucher inventory units (barcodes/links) for the owned tenants' offers.
    // Keyed by offerId, so it follows the offers, not the tenant directly.
    voucherCodesCol.countDocuments({ offerId: { $in: targets.domainOwnedOfferIds } }),
    // Custom contact-column definitions for the owned tenants.
    tenants.tenantContactFields.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    // Bulk member-invite jobs + their items for the owned tenants.
    inviteJobs.memberInviteJobs.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    inviteJobs.memberInviteJobItems.countDocuments({ tenantId: { $in: targets.domainOwnedTenantIds } }),
    // Plan #1: phone-OTP challenges keyed by the user's phone.
    db.collection(PHONE_OTP_COLLECTION).countDocuments({
      phone: { $in: targets.walletPhones },
    }),
    // Plan #1: email-OTP challenges keyed by email.
    db.collection(EMAIL_OTP_COLLECTION).countDocuments({ email }),
    // Plan #1: phone signup tickets keyed by phone (short-lived).
    db.collection(PHONE_SIGNUP_TICKET_COLLECTION).countDocuments({
      phone: { $in: targets.walletPhones },
    }),
    // Plan #1: wallet rate-limit markers keyed by phone or email.
    db.collection(WALLET_RATE_LIMIT_COLLECTION).countDocuments({
      $or: [
        ...(targets.walletPhones.length ? [{ key: { $in: targets.walletPhones } }] : []),
        { key: email },
      ],
    }),
    // Plan #4: tenant join requests submitted by the user.
    db.collection(TENANT_JOIN_REQUEST_COLLECTION).countDocuments({
      $or: [
        ...(targets.nexusIdentityIds.length
          ? [{ nexusIdentityId: { $in: targets.nexusIdentityIds } }]
          : []),
        { email },
      ],
    }),
    // Plan #4: tenant join requests TO tenants the user owns.
    db.collection(TENANT_JOIN_REQUEST_COLLECTION).countDocuments({
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
    voucherCodes,
    tenantContactFields,
    memberInviteJobs,
    memberInviteJobItems,
    phoneOtpChallenges,
    emailOtpChallenges,
    phoneSignupTickets,
    walletRateLimits,
    tenantJoinRequestsByUser,
    tenantJoinRequestsForOwnedTenants,
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
  const voucherCodesCol = getVoucherCodeCollection(db);
  const inviteJobs = getInviteJobCollections(db);
  const orchestration = getOrchestrationDomainCollections(db);
  const onboarding = getOnboardingCollections(db);
  const targets = await resolveMongoDeletionTargets(email, prismaUser);
  const orchestrationTargets = await resolveOrchestrationDeletionTargets(targets);
  const legacyMemberOnlyTenantIds = getLegacyMemberOnlyTenantIds(targets);

  // Plan #1 / #4: wallet auth ephemeral collections + join requests.
  // Done first so a freshly verified phone or in-flight challenge can't
  // leak after the identity goes away.
  if (targets.walletPhones.length > 0) {
    await db.collection(PHONE_OTP_COLLECTION).deleteMany({
      phone: { $in: targets.walletPhones },
    });
    await db.collection(PHONE_SIGNUP_TICKET_COLLECTION).deleteMany({
      phone: { $in: targets.walletPhones },
    });
  }
  await db.collection(EMAIL_OTP_COLLECTION).deleteMany({ email });
  await db.collection(WALLET_RATE_LIMIT_COLLECTION).deleteMany({
    $or: [
      ...(targets.walletPhones.length ? [{ key: { $in: targets.walletPhones } }] : []),
      { key: email },
    ],
  });
  await db.collection(TENANT_JOIN_REQUEST_COLLECTION).deleteMany({
    $or: [
      ...(targets.nexusIdentityIds.length
        ? [{ nexusIdentityId: { $in: targets.nexusIdentityIds } }]
        : []),
      { email },
      ...(targets.domainOwnedTenantIds.length
        ? [{ tenantId: { $in: targets.domainOwnedTenantIds } }]
        : []),
    ],
  });

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
  // Bulk member-invite job items + jobs for the owned tenants (items first so no
  // item ever outlives its parent job).
  await inviteJobs.memberInviteJobItems.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  await inviteJobs.memberInviteJobs.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  // Delete adoption records (tenant chose to show these platform offers to members).
  await supply.tenantOfferConfigs.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  // Collect image URLs before deleting offer documents so we can clean up Cloudinary.
  // Project both the legacy single `imageUrl` and the multi-image `imageUrls` gallery so
  // every uploaded image gets deleted, not just the cover.
  const offersToDelete = await supply.nexusOffers
    .find(
      { createdByTenantId: { $in: targets.domainOwnedTenantIds } },
      { projection: { imageUrl: 1, imageUrls: 1 } },
    )
    .toArray();
  await supply.nexusOffers.deleteMany({ createdByTenantId: { $in: targets.domainOwnedTenantIds } });
  // Voucher inventory units belong to those offers (keyed by offerId), so remove
  // them too - otherwise they linger as orphans after the offers are gone.
  if (targets.domainOwnedOfferIds.length > 0) {
    await voucherCodesCol.deleteMany({ offerId: { $in: targets.domainOwnedOfferIds } });
  }
  // Delete Cloudinary images after DB rows are gone. Errors are swallowed per deleteOfferImage contract.
  // Each offer can have a gallery (imageUrls) plus a legacy cover (imageUrl) that may not be in the gallery.
  await Promise.all(
    offersToDelete.flatMap((o) => {
      const gallery = o.imageUrls ?? [];
      const legacy = o.imageUrl && !gallery.includes(o.imageUrl) ? [o.imageUrl] : [];
      return [...gallery, ...legacy].map((url) => deleteOfferImage(url));
    }),
  );
  await tenants.tenantCatalogPolicies.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
  // Custom contact-column definitions for the owned tenants.
  await tenants.tenantContactFields.deleteMany({ tenantId: { $in: targets.domainOwnedTenantIds } });
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
