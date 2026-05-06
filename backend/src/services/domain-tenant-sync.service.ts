/**
 * Synchronizes legacy onboarding tenants into MongoDB domain tenant records.
 * This bridge keeps current dashboard behavior while the domain model takes over.
 */
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../config/mongo';
import {
  getIdentityDomainCollections,
  getTenantDomainCollections,
  type TenantUserRoleName,
} from '../models/domain';
import type { TenantDocument, TenantMemberDocument } from '../models/onboarding.models';

export interface LegacyTenantMembershipSyncInput {
  tenantId: ObjectId;
  tenant: TenantDocument;
  tenantMembershipId: ObjectId;
  tenantMembership: TenantMemberDocument;
  nexusIdentityId: string;
}

/**
 * Maps legacy onboarding tenant roles to source-of-truth domain roles.
 * Input: legacy role string from tenantMembers.
 * Output: valid domain tenant role for TenantUserRole.
 */
function mapLegacyTenantRole(role: TenantMemberDocument['role']): TenantUserRoleName {
  if (role === 'support') return 'operator';
  return role;
}

/**
 * Maps legacy onboarding status into domain tenant status.
 * Input: current tenant document status.
 * Output: target domain tenant status.
 */
function mapLegacyTenantStatus(status: TenantDocument['status']): 'build_mode' | 'active' | 'suspended' {
  if (status === 'suspended') return 'suspended';
  if (status === 'active') return 'build_mode';
  return 'build_mode';
}

/**
 * Maps legacy business setup progress into domain onboarding state.
 * Input: current business setup status.
 * Output: target domain onboarding state.
 */
function mapLegacyOnboardingState(status: TenantDocument['businessSetupStatus']): 'build_mode' | 'go_live_pending' {
  return status === 'approved' ? 'go_live_pending' : 'build_mode';
}

/**
 * Mirrors one legacy tenant membership into domain tenant/member/role records.
 * Input: trusted legacy tenant, membership, and domain identity id.
 * Output: domain records are upserted idempotently.
 */
export async function syncDomainTenantMembership(input: LegacyTenantMembershipSyncInput): Promise<void> {
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const identityCollections = getIdentityDomainCollections(db);
  const tenantId = input.tenantId.toHexString();
  const tenantMemberId = input.tenantMembershipId.toHexString();
  const now = new Date();
  const role = mapLegacyTenantRole(input.tenantMembership.role);

  await Promise.all([
    tenantCollections.domainTenants.updateOne(
      { tenantId },
      {
        $setOnInsert: {
          tenantId,
          createdByIdentityId: input.nexusIdentityId,
          createdAt: input.tenant.createdAt,
        },
        $set: {
          organizationName: input.tenant.organizationName,
          status: mapLegacyTenantStatus(input.tenant.status),
          updatedAt: now,
        },
      },
      { upsert: true },
    ),
    tenantCollections.tenantOnboardingStates.updateOne(
      { tenantId },
      {
        $setOnInsert: {
          tenantOnboardingStateId: `tenant_state_${tenantId}`,
          tenantId,
          createdAt: input.tenant.createdAt,
        },
        $set: {
          state: mapLegacyOnboardingState(input.tenant.businessSetupStatus),
          updatedAt: now,
        },
      },
      { upsert: true },
    ),
    tenantCollections.tenantProfiles.updateOne(
      { tenantId },
      {
        $setOnInsert: {
          tenantProfileId: `tenant_profile_${tenantId}`,
          tenantId,
          createdAt: input.tenant.createdAt,
        },
        $set: {
          website: input.tenant.website,
          businessDescription: input.tenant.businessDescription,
          selectedUseCases: [...input.tenant.selectedUseCases],
          updatedAt: now,
        },
      },
      { upsert: true },
    ),
    tenantCollections.tenantMembers.updateOne(
      { tenantId, nexusIdentityId: input.nexusIdentityId },
      {
        $setOnInsert: {
          tenantMemberId,
          tenantId,
          nexusIdentityId: input.nexusIdentityId,
          createdAt: input.tenantMembership.createdAt,
        },
        $set: {
          status: input.tenantMembership.status === 'pending' ? 'pending_approval' : input.tenantMembership.status,
          requireAdminApproval: false,
          customFields: {},
          updatedAt: now,
        },
      },
      { upsert: true },
    ),
    identityCollections.tenantUserRoles.updateOne(
      { tenantId, nexusIdentityId: input.nexusIdentityId, role },
      {
        $setOnInsert: {
          tenantUserRoleId: `tenant_role_${tenantId}_${input.nexusIdentityId}_${role}`,
          tenantId,
          nexusIdentityId: input.nexusIdentityId,
          role,
          createdAt: input.tenantMembership.createdAt,
        },
        $set: {
          updatedAt: now,
        },
      },
      { upsert: true },
    ),
  ]);
}
