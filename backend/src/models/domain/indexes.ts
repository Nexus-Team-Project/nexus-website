/**
 * Creates MongoDB indexes for the NEXUS domain model foundation.
 * Startup calls this once so future services can rely on identity uniqueness.
 */
import type { Db } from 'mongodb';
import { getIdentityDomainCollections } from './identity.models';
import { getOrchestrationDomainCollections } from './orchestration.models';
import { getTenantDomainCollections } from './tenant.models';

/**
 * Creates idempotent indexes for identity, tenant, member, event, and saga data.
 * Input: Mongo database handle.
 * Output: required indexes exist before new domain routes are added.
 */
export async function ensureDomainIndexes(db: Db): Promise<void> {
  const identity = getIdentityDomainCollections(db);
  const tenants = getTenantDomainCollections(db);
  const orchestration = getOrchestrationDomainCollections(db);

  await Promise.all([
    identity.nexusIdentities.createIndex({ normalizedEmail: 1 }, { unique: true }),
    identity.nexusIdentities.createIndex({ prismaUserId: 1 }, { sparse: true }),
    identity.contactProfiles.createIndex({ nexusIdentityId: 1, channel: 1 }),
    identity.contactProfiles.createIndex({ channel: 1, normalizedIdentifier: 1 }, { unique: true }),
    identity.tenantUserRoles.createIndex({ nexusIdentityId: 1, tenantId: 1 }),
    identity.tenantUserRoles.createIndex({ nexusIdentityId: 1, tenantId: 1, role: 1 }, { unique: true }),
    identity.rolePermissionMaps.createIndex({ role: 1, permission: 1 }, { unique: true }),

    tenants.domainTenants.createIndex({ tenantId: 1 }, { unique: true }),
    tenants.domainTenants.createIndex({ createdByIdentityId: 1 }),
    tenants.tenantOnboardingStates.createIndex({ tenantId: 1 }, { unique: true }),
    tenants.tenantProfiles.createIndex({ tenantId: 1 }, { unique: true }),
    tenants.tenantServiceActivations.createIndex({ tenantId: 1, serviceKey: 1 }, { unique: true }),
    tenants.tenantMembers.createIndex({ nexusIdentityId: 1, tenantId: 1 }, { unique: true }),
    tenants.tenantMembers.createIndex({ tenantId: 1, status: 1 }),
    tenants.memberGroups.createIndex({ tenantId: 1, name: 1 }, { unique: true }),
    tenants.memberGroupAssignments.createIndex({ memberGroupId: 1, tenantMemberId: 1 }, { unique: true }),

    orchestration.platformEvents.createIndex({ eventType: 1, createdAt: -1 }),
    orchestration.sagaInstances.createIndex(
      { sagaType: 1, tenantId: 1, memberId: 1, providerId: 1, clientIdempotencyKey: 1 },
      { unique: true, sparse: true },
    ),
    orchestration.processedSteps.createIndex({ sagaInstanceId: 1, step: 1 }, { unique: true }),
    orchestration.consumedEvents.createIndex({ platformEventId: 1, consumerName: 1 }, { unique: true }),
  ]);
}
