/**
 * Owns domain service activation helpers for tenant services.
 * Benefits Catalog activation must create a TenantCatalogPolicy immediately.
 */
import { ObjectId } from 'mongodb';
import { prisma } from '../config/database';
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import {
  getTenantDomainCollections,
  type CatalogAdoptionMode,
  type DefaultPricingRule,
} from '../models/domain';
import { getOnboardingCollections } from '../models/onboarding.models';
import type { BenefitsCatalogActivationInput } from '../schemas/domain-service-activation.schemas';
import { getDomainAuthorizationContext, hasDomainPermission } from './domain-authorization.service';
import { syncDomainIdentityForLoginUser } from './domain-identity.service';
import { syncDomainTenantMembership } from './domain-tenant-sync.service';
import { getUserContext } from './onboarding.service';

export type BenefitsCatalogStartingMode = 'plug_and_play' | 'curated' | 'build_from_scratch';
type PublicPricingMode = 'managed_by_nexus' | 'inherit_selection' | 'manual_required';

interface BenefitsCatalogPolicyDefaults {
  catalogAdoptionMode: CatalogAdoptionMode;
  defaultPricingRule: DefaultPricingRule;
  publicPricingMode: PublicPricingMode;
}

const BENEFITS_CATALOG_MODE_DEFAULTS: Record<BenefitsCatalogStartingMode, BenefitsCatalogPolicyDefaults> = {
  plug_and_play: {
    catalogAdoptionMode: 'auto_silent',
    defaultPricingRule: 'nexus_price',
    publicPricingMode: 'managed_by_nexus',
  },
  curated: {
    catalogAdoptionMode: 'auto_notify',
    defaultPricingRule: 'inherit_selection',
    publicPricingMode: 'inherit_selection',
  },
  build_from_scratch: {
    catalogAdoptionMode: 'manual',
    defaultPricingRule: 'manual_required',
    publicPricingMode: 'manual_required',
  },
};

export interface BenefitsCatalogActivationResponse {
  tenantId: string;
  serviceKey: 'benefits_catalog';
  status: 'active';
  catalogAdoptionMode: CatalogAdoptionMode;
  pricingMode: PublicPricingMode;
}

/**
 * Loads trusted login data for a service activation request.
 * Input: Prisma user id from the authenticated request.
 * Output: minimal login user fields or a 404 error.
 */
async function getActivationLoginUser(userId: string): Promise<{
  id: string;
  email: string;
  fullName: string;
  provider: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, provider: true },
  });
  if (!user) throw createError('User not found', 404);
  return user;
}

/**
 * Requires tenant service activation permission from domain role records.
 * Input: Prisma user id from the authenticated request.
 * Output: tenant id and identity id when permission is granted.
 */
async function requireServiceActivationAccess(userId: string): Promise<{
  tenantObjectId: ObjectId;
  tenantId: string;
  nexusIdentityId: string;
}> {
  const [user, context] = await Promise.all([getActivationLoginUser(userId), getUserContext(userId)]);
  if (!context.isTenant || !context.tenantId) throw createError('Tenant access required', 403);

  const tenantObjectId = new ObjectId(context.tenantId);
  const domainIdentity = await syncDomainIdentityForLoginUser(user);
  const db = await getMongoDb();
  const tenantCollections = getTenantDomainCollections(db);
  const [tenant, tenantMembership] = await Promise.all([
    tenantCollections.domainTenants.findOne({ tenantId: context.tenantId }),
    tenantCollections.tenantMembers.findOne({
      tenantId: context.tenantId,
      nexusIdentityId: domainIdentity.nexusIdentityId,
      status: 'active',
    }),
  ]);

  if (!tenant || !tenantMembership) {
    const legacyCollections = getOnboardingCollections(db);
    const legacyTenant = await legacyCollections.tenants.findOne({ _id: tenantObjectId });
    const legacyMembership = await legacyCollections.tenantMembers.findOne({
      tenantId: tenantObjectId,
      userId,
      status: 'active',
    });
    if (legacyTenant && legacyMembership?._id) {
      await syncDomainTenantMembership({
        tenantId: tenantObjectId,
        tenant: legacyTenant,
        tenantMembershipId: legacyMembership._id,
        tenantMembership: legacyMembership,
        nexusIdentityId: domainIdentity.nexusIdentityId,
      });
    }
  }

  const authorization = await getDomainAuthorizationContext(domainIdentity.nexusIdentityId, context.tenantId);
  if (!hasDomainPermission(authorization, 'tenant.activate_services')) throw createError('Forbidden', 403);

  return {
    tenantObjectId,
    tenantId: context.tenantId,
    nexusIdentityId: domainIdentity.nexusIdentityId,
  };
}

/**
 * Ensures a Benefits Catalog policy exists for one tenant.
 * Input: tenant id and starting mode selected during service activation.
 * Output: TenantCatalogPolicy exists with source-of-truth default rules.
 */
export async function ensureBenefitsCatalogPolicy(
  tenantId: string,
  startingMode: BenefitsCatalogStartingMode,
): Promise<void> {
  const db = await getMongoDb();
  const collections = getTenantDomainCollections(db);
  const now = new Date();
  const defaults = BENEFITS_CATALOG_MODE_DEFAULTS[startingMode];

  await collections.tenantCatalogPolicies.updateOne(
    { tenantId },
    {
      $setOnInsert: {
        tenantCatalogPolicyId: `tenant_catalog_policy_${tenantId}`,
        tenantId,
        pendingReviewTimeoutDays: 30,
        notificationRoles: ['admin', 'operator'],
        createdAt: now,
      },
      $set: {
        catalogAdoptionMode: defaults.catalogAdoptionMode,
        defaultPricingRule: defaults.defaultPricingRule,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
}

/**
 * Activates Benefits Catalog for the authenticated tenant admin.
 * Input: Prisma user id and selected Benefits Catalog starting mode.
 * Output: public activation state without exposing internal Nexus pricing.
 */
export async function activateBenefitsCatalogForUser(
  userId: string,
  input: BenefitsCatalogActivationInput,
): Promise<BenefitsCatalogActivationResponse> {
  const access = await requireServiceActivationAccess(userId);
  const db = await getMongoDb();
  const collections = getTenantDomainCollections(db);
  const now = new Date();
  const defaults = BENEFITS_CATALOG_MODE_DEFAULTS[input.startingMode];

  await collections.tenantServiceActivations.updateOne(
    { tenantId: access.tenantId, serviceKey: 'benefits_catalog' },
    {
      $setOnInsert: {
        tenantServiceActivationId: `tenant_service_activation_${access.tenantId}_benefits_catalog`,
        tenantId: access.tenantId,
        serviceKey: 'benefits_catalog',
        createdAt: now,
      },
      $set: {
        status: 'active',
        activatedByIdentityId: access.nexusIdentityId,
        activatedAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  await ensureBenefitsCatalogPolicy(access.tenantId, input.startingMode);

  return {
    tenantId: access.tenantObjectId.toHexString(),
    serviceKey: 'benefits_catalog',
    status: 'active',
    catalogAdoptionMode: defaults.catalogAdoptionMode,
    pricingMode: defaults.publicPricingMode,
  };
}
