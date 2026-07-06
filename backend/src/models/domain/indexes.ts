/**
 * Creates MongoDB indexes for the NEXUS domain model foundation.
 * Startup calls this once so future services can rely on identity uniqueness.
 */
import type { Db } from 'mongodb';
import { getIdentityDomainCollections } from './identity.models';
import { getOrchestrationDomainCollections } from './orchestration.models';
import { getTenantDomainCollections } from './tenant.models';
import { getSupplyDomainCollections } from './supply.models';
import { ensureVoucherCodeIndexes } from './voucher-codes.models';
import { ensureInviteJobIndexes } from './invite-jobs.models';
import { ensurePhoneOtpIndexes } from '../auth/phone-otp.models';
import { ensureEmailOtpIndexes } from '../auth/email-otp.models';
import { ensurePhoneSignupTicketIndexes } from '../auth/phone-signup-ticket.models';
import { ensureTenantJoinRequestIndexes } from '../auth/tenant-join-request.models';
import { ensureLoginOtpIndexes } from '../auth/login-otp.models';
import { ensureTrustedDeviceIndexes } from '../auth/trusted-device.models';
import { ensureOnboardingPhoneVerificationIndexes } from '../auth/onboarding-phone-verification.models';

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
    // Wallet phone login - unique sparse so identities without phone coexist.
    identity.nexusIdentities.createIndex(
      { phone: 1 },
      { name: 'phone_unique', unique: true, sparse: true },
    ),
    identity.contactProfiles.createIndex({ nexusIdentityId: 1, channel: 1 }),
    identity.contactProfiles.createIndex({ channel: 1, normalizedIdentifier: 1 }, { unique: true }),
    identity.tenantUserRoles.createIndex({ nexusIdentityId: 1, tenantId: 1 }),
    identity.tenantUserRoles.createIndex({ nexusIdentityId: 1, tenantId: 1, role: 1 }, { unique: true }),
    // Supports fast seat-count aggregation: count distinct identities by tenant + non-member role.
    identity.tenantUserRoles.createIndex({ tenantId: 1, role: 1 }),
    identity.rolePermissionMaps.createIndex({ role: 1, permission: 1 }, { unique: true }),

    tenants.domainTenants.createIndex({ tenantId: 1 }, { unique: true }),
    tenants.domainTenants.createIndex({ createdByIdentityId: 1 }),
    tenants.tenantOnboardingStates.createIndex({ tenantId: 1 }, { unique: true }),
    tenants.tenantProfiles.createIndex({ tenantId: 1 }, { unique: true }),
    tenants.tenantServiceActivations.createIndex({ tenantId: 1, serviceKey: 1 }, { unique: true }),
    tenants.tenantMembers.createIndex({ nexusIdentityId: 1, tenantId: 1 }, { unique: true }),
    tenants.tenantMembers.createIndex({ tenantId: 1, status: 1 }),
    // Compound index for paginated member list sorted by creation time.
    tenants.tenantMembers.createIndex({ tenantId: 1, createdAt: -1 }),
    tenants.tenantMemberInvitations.createIndex({ tokenHash: 1 }, { unique: true }),
    tenants.tenantMemberInvitations.createIndex({ tenantId: 1, normalizedEmail: 1, status: 1 }),
    tenants.tenantMemberInvitations.createIndex({ expiresAt: 1 }),
    // Compound index for listing pending invitations by tenant, sorted by creation time.
    tenants.tenantMemberInvitations.createIndex({ tenantId: 1, status: 1, createdAt: -1 }),
    tenants.memberGroups.createIndex({ tenantId: 1, name: 1 }, { unique: true }),
    tenants.memberGroupAssignments.createIndex({ memberGroupId: 1, tenantMemberId: 1 }, { unique: true }),
    tenants.tenantCatalogPolicies.createIndex({ tenantId: 1 }, { unique: true }),
    // Unique contact per tenant per email; sorted list by creation time.
    tenants.tenantContacts.createIndex({ tenantId: 1, normalizedEmail: 1 }, { unique: true }),
    tenants.tenantContacts.createIndex({ tenantId: 1, createdAt: -1 }),
    // Backs filtering by custom column values (customFields.<fieldId>). Wildcard
    // index so any dynamic custom-column path is covered without a fixed schema.
    tenants.tenantContacts.createIndex({ 'customFields.$**': 1 }, { name: 'customFields_wildcard' }),
    // Custom column definitions: unique id per tenant, ordered list per tenant.
    tenants.tenantContactFields.createIndex({ tenantId: 1, fieldId: 1 }, { unique: true }),
    tenants.tenantContactFields.createIndex({ tenantId: 1, order: 1 }),
    // One wallet-profile mirror column per (tenant, sourceFieldKey).
    tenants.tenantContactFields.createIndex(
      { tenantId: 1, sourceFieldKey: 1 },
      { name: 'uniq_wallet_profile_field', unique: true, partialFilterExpression: { origin: 'wallet_profile' } },
    ),

    orchestration.platformEvents.createIndex({ eventType: 1, createdAt: -1 }),
    orchestration.sagaInstances.createIndex(
      { sagaType: 1, tenantId: 1, memberId: 1, providerId: 1, clientIdempotencyKey: 1 },
      { unique: true, sparse: true },
    ),
    orchestration.processedSteps.createIndex({ sagaInstanceId: 1, step: 1 }, { unique: true }),
    orchestration.consumedEvents.createIndex({ platformEventId: 1, consumerName: 1 }, { unique: true }),
  ]);

  const supply = getSupplyDomainCollections(db);
  await Promise.all([
    supply.nexusOffers.createIndex({ offerId: 1 }, { unique: true }),
    supply.nexusOffers.createIndex({ status: 1, visibility: 1 }),
    supply.nexusOffers.createIndex({ createdByTenantId: 1, status: 1 }),
    supply.nexusOffers.createIndex({ category: 1, status: 1 }),
    // Supports the paginated platform-catalog view: filter by status + visibility,
    // sort newest-first. Required once GET /api/v1/offers/platform is paginated.
    supply.nexusOffers.createIndex(
      { status: 1, visibility: 1, createdAt: -1 },
      { name: 'status_visibility_createdAt' },
    ),
    // Backs filter+sort by price for the catalog views. displayPrice is the
    // denormalized voucher→member_price / other→market_price?:member_price.
    supply.nexusOffers.createIndex(
      { status: 1, visibility: 1, displayPrice: 1, createdAt: -1 },
      { name: 'status_visibility_displayPrice_createdAt' },
    ),
    // Backs category-narrowed price range.
    supply.nexusOffers.createIndex(
      { status: 1, category: 1, displayPrice: 1 },
      { name: 'status_category_displayPrice' },
    ),
    // Backs expiry_soon / expiry_far sort and validUntilBefore filter.
    supply.nexusOffers.createIndex(
      { status: 1, validUntil: 1 },
      { name: 'status_validUntil' },
    ),
    // Backs tags ANY-of filter ($in). Multikey index.
    supply.nexusOffers.createIndex(
      { tags: 1 },
      { name: 'tags' },
    ),
    supply.tenantOfferConfigs.createIndex({ tenantId: 1, offerId: 1 }, { unique: true }),
    supply.tenantOfferConfigs.createIndex({ tenantId: 1, adoptionStatus: 1 }),
    // Supports the paginated member catalog: list a tenant's adopted offers
    // sorted by adoption time. Required once GET /api/v1/offers/:tenantId is paginated.
    supply.tenantOfferConfigs.createIndex(
      { tenantId: 1, adoptionStatus: 1, adoptedAt: -1 },
      { name: 'tenant_adoption_adoptedAt' },
    ),
  ]);

  await ensureVoucherCodeIndexes(db);
  await ensureInviteJobIndexes(db);
  await ensurePhoneOtpIndexes(db);
  await ensureEmailOtpIndexes(db);
  await ensurePhoneSignupTicketIndexes(db);
  await ensureTenantJoinRequestIndexes(db);
  await ensureLoginOtpIndexes(db);
  await ensureTrustedDeviceIndexes(db);
  await ensureOnboardingPhoneVerificationIndexes(db);
}
