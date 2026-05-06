/**
 * Defines MongoDB collection names for NEXUS domain data.
 * These collections are the authoritative platform store outside website login.
 */
export const DOMAIN_COLLECTIONS = {
  nexusIdentities: 'nexusIdentities',
  contactProfiles: 'contactProfiles',
  tenantUserRoles: 'tenantUserRoles',
  rolePermissionMaps: 'rolePermissionMaps',
  domainTenants: 'domainTenants',
  tenantOnboardingStates: 'tenantOnboardingStates',
  tenantProfiles: 'tenantProfiles',
  tenantServiceActivations: 'tenantServiceActivations',
  tenantMembers: 'tenantMembersV2',
  memberGroups: 'memberGroups',
  memberGroupAssignments: 'memberGroupAssignments',
  tenantCatalogPolicies: 'tenantCatalogPolicies',
  platformEvents: 'platformEvents',
  sagaInstances: 'sagaInstances',
  processedSteps: 'processedSteps',
  consumedEvents: 'consumedEvents',
} as const;

export type DomainCollectionName = keyof typeof DOMAIN_COLLECTIONS;
