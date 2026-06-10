/**
 * Seeds the canonical role-permission map into MongoDB on every backend startup.
 * Permission IDs align with NEXUS-PRODSPEC-ROLES-001 v0.1.
 * The stale-row cleanup removes any permissions no longer in this catalog.
 */
import { getMongoDb } from '../config/mongo';
import { getIdentityDomainCollections, type TenantUserRoleName } from '../models/domain';

// ─── Permission catalog ───────────────────────────────────────────────────────
// Organized by the 16 functional categories from the product spec.
// Categories are presentational only - they have no semantic effect on enforcement.

export const DOMAIN_PERMISSIONS = [
  // 3.1 Workspace
  'workspace.complete_business_details',
  'workspace.view_settings',
  'workspace.update_settings',
  'workspace.trigger_go_live',
  'workspace.activate_service',
  'workspace.activate_benefits_catalog',
  'workspace.initiate_provider_activation',
  'workspace.transfer',  // owner-only
  'workspace.delete',    // owner-only - endpoint not yet built
  // 3.2 Team
  'team.view_members',
  'team.invite_member',
  'team.remove_member',
  'roles.assign',
  'roles.revoke',
  'roles.create_custom',   // Phase 3
  'roles.update_custom',   // Phase 3
  'roles.delete_custom',   // Phase 3
  // 3.3 Members
  'members.view',
  'members.create',
  'members.update',
  'members.deactivate',
  'members.bulk_status_change',
  'members.bulk_import',
  'members.export',
  'groups.view',
  'groups.manage',
  'groups.assign_member',
  'members.define_custom_fields',
  'members.set_custom_field_value',
  // 3.4 Catalog
  'catalog.view',
  'catalog.adopt_offer',
  'catalog.exclude_offer',
  'catalog.configure_pricing',
  'catalog.set_adoption_mode',
  'catalog.manage_exposure',
  'catalog.manage_provider_selection',
  'catalog.manage_group_selection',
  'catalog.manage_campaigns',
  'catalog.view_pending_review',
  // 3.5 Supply
  'supply.view',
  'supply.ingest',
  'supply.manage_offers',
  'supply.manage_variant_execution',
  'supply.invite_provider',
  'supply.manage_provider_visibility',
  'supply.view_provider_settings',
  'supply.update_provider_settings',
  'supply.upgrade_financial_model',
  // 3.6 Allocations
  'allocations.view',
  'allocations.create',
  'allocations.update_draft',
  'allocations.execute',
  'allocations.cancel',
  'allocations.reclaim',
  'allocations.manage_audience_rules',
  'subsidy_budget.view',
  'subsidy_budget.create',
  'subsidy_budget.fund',
  'subsidy_budget.update',
  // 3.7 Transactions
  'transactions.view',
  'transactions.refund',
  'transactions.void',
  'transactions.recover',
  'transactions.manage_disputes',
  'entitlements.view',
  'entitlements.revoke',
  // 3.8 Wallet
  'wallet.view_member_balance',
  'wallet.view_aggregates',
  'wallet.configure_default_bucket',
  'tenant_balance.view',
  // 3.9 Billing
  'billing.view',
  'billing.manage_subscriptions',
  'billing.manage_payment_methods',
  'billing.view_invoices',
  'billing.manage_domain_settings',
  // 3.10 Payments
  'payments.view_transactions',
  'payments.view_settlement',
  'payments.view_payouts',
  'payments.manage_refunds',
  'payments.manage_chargebacks',
  'payments.configure_psp',
  'payments.view_tax_documents',
  'payments.fund_account',
  // 3.11 Marketing (placeholders - Marketing Suite not yet built)
  'marketing.view_campaigns',
  'marketing.manage_campaigns',
  'marketing.manage_email',
  'marketing.manage_push',
  'marketing.manage_promotions',
  'marketing.view_analytics',
  'marketing.manage_seo',
  'marketing.manage_integrations',
  // 3.12 Engagement (placeholders - Marketing Suite not yet built)
  'engagement.view_contacts',
  'engagement.manage_contacts',
  'engagement.message_inbox',
  'engagement.manage_inbox_settings',
  'engagement.manage_workflows',
  'engagement.manage_automations',
  'engagement.manage_pipelines',
  'engagement.broadcast_announcement',
  'engagement.manage_community_spaces',
  'engagement.moderate_content',
  // 3.13 Analytics
  'analytics.view_dashboards',
  'analytics.view_reports',
  'analytics.export_reports',
  'analytics.manage_custom_reports',
  'analytics.view_audit_log',
  // 3.14 Developer
  'developer.view_api_keys',
  'developer.manage_api_keys',
  'developer.view_webhooks',
  'developer.manage_webhooks',
  'developer.view_external_clients',
  'developer.register_external_client',
  'developer.revoke_external_client',
  'developer.view_logs',
  // 3.15 Platform (platform-side roles only)
  'platform.view_all_tenants',
  'platform.suspend_workspace',
  'platform.unsuspend_workspace',
  'platform.approve_provider_activation',
  'platform.reject_provider_activation',
  'platform.set_nexus_pricing',
  'platform.view_settlement_reports',
  'platform.manage_platform_billing',
  'platform.recovery_decision',
  'platform.view_audit_log_cross_tenant',
  'platform.manage_global_config',
  'platform.assign_platform_role',
  'platform.cross_tenant_read',
  'platform.view_provider_relations',
  'platform.manage_provider_relations',
  'platform.send_platform_announcement',
  'platform.manage_platform_marketing',
  // 3.16 Support
  'support.view_member_case',
  'support.view_eligibility_explanation',
  'support.initiate_refund_request',
  'support.initiate_recovery_request',
  'support.log_communication',
  'support.escalate_case',
] as const;

export type DomainPermission = typeof DOMAIN_PERMISSIONS[number];

// ─── Shared permission subsets ────────────────────────────────────────────────
// Reused across multiple bundles to keep the table DRY.

const WORKSPACE_VIEW: readonly DomainPermission[] = [
  'workspace.view_settings',
  'workspace.complete_business_details',
];

const FULL_MEMBERS: readonly DomainPermission[] = [
  'members.view',
  'members.create',
  'members.update',
  'members.deactivate',
  'members.bulk_status_change',
  'members.bulk_import',
  'members.export',
  'groups.view',
  'groups.manage',
  'groups.assign_member',
  'members.define_custom_fields',
  'members.set_custom_field_value',
];

const FULL_TEAM: readonly DomainPermission[] = [
  'team.view_members',
  'team.invite_member',
  'team.remove_member',
  'roles.assign',
  'roles.revoke',
  'roles.create_custom',
  'roles.update_custom',
  'roles.delete_custom',
];

const FULL_CATALOG: readonly DomainPermission[] = [
  'catalog.view',
  'catalog.adopt_offer',
  'catalog.exclude_offer',
  'catalog.configure_pricing',
  'catalog.set_adoption_mode',
  'catalog.manage_exposure',
  'catalog.manage_provider_selection',
  'catalog.manage_group_selection',
  'catalog.manage_campaigns',
  'catalog.view_pending_review',
];

const FULL_SUPPLY: readonly DomainPermission[] = [
  'supply.view',
  'supply.ingest',
  'supply.manage_offers',
  'supply.manage_variant_execution',
  'supply.invite_provider',
  'supply.manage_provider_visibility',
  'supply.view_provider_settings',
  'supply.update_provider_settings',
  'supply.upgrade_financial_model',
];

const FULL_ALLOCATIONS: readonly DomainPermission[] = [
  'allocations.view',
  'allocations.create',
  'allocations.update_draft',
  'allocations.execute',
  'allocations.cancel',
  'allocations.reclaim',
  'allocations.manage_audience_rules',
  'subsidy_budget.view',
  'subsidy_budget.create',
  'subsidy_budget.fund',
  'subsidy_budget.update',
];

const FULL_TRANSACTIONS: readonly DomainPermission[] = [
  'transactions.view',
  'transactions.refund',
  'transactions.void',
  'transactions.recover',
  'transactions.manage_disputes',
  'entitlements.view',
  'entitlements.revoke',
];

const FULL_WALLET: readonly DomainPermission[] = [
  'wallet.view_member_balance',
  'wallet.view_aggregates',
  'wallet.configure_default_bucket',
  'tenant_balance.view',
];

const FULL_BILLING: readonly DomainPermission[] = [
  'billing.view',
  'billing.manage_subscriptions',
  'billing.manage_payment_methods',
  'billing.view_invoices',
  'billing.manage_domain_settings',
];

const FULL_PAYMENTS: readonly DomainPermission[] = [
  'payments.view_transactions',
  'payments.view_settlement',
  'payments.view_payouts',
  'payments.manage_refunds',
  'payments.manage_chargebacks',
  'payments.configure_psp',
  'payments.view_tax_documents',
  'payments.fund_account',
];

const FULL_ANALYTICS: readonly DomainPermission[] = [
  'analytics.view_dashboards',
  'analytics.view_reports',
  'analytics.export_reports',
  'analytics.manage_custom_reports',
  'analytics.view_audit_log',
];

const FULL_DEVELOPER: readonly DomainPermission[] = [
  'developer.view_api_keys',
  'developer.manage_api_keys',
  'developer.view_webhooks',
  'developer.manage_webhooks',
  'developer.view_external_clients',
  'developer.register_external_client',
  'developer.revoke_external_client',
  'developer.view_logs',
];

const FULL_SUPPORT: readonly DomainPermission[] = [
  'support.view_member_case',
  'support.view_eligibility_explanation',
  'support.initiate_refund_request',
  'support.initiate_recovery_request',
  'support.log_communication',
  'support.escalate_case',
];

const VIEW_ANALYTICS: readonly DomainPermission[] = [
  'analytics.view_dashboards',
  'analytics.view_reports',
];

const VIEW_MEMBERS: readonly DomainPermission[] = ['members.view', 'groups.view'];
const VIEW_WALLET: readonly DomainPermission[] = ['wallet.view_aggregates'];
const VIEW_TRANSACTIONS: readonly DomainPermission[] = ['transactions.view', 'entitlements.view'];

// ─── Role permission bundles ──────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<TenantUserRoleName, readonly DomainPermission[]> = {

  // Owner - identical to admin + transfer + delete. Assigned at workspace creation only.
  owner: [
    'workspace.complete_business_details',
    'workspace.view_settings',
    'workspace.update_settings',
    'workspace.trigger_go_live',
    'workspace.activate_service',
    'workspace.activate_benefits_catalog',
    'workspace.initiate_provider_activation',
    'workspace.transfer',
    'workspace.delete',
    ...FULL_TEAM,
    ...FULL_MEMBERS,
    ...FULL_CATALOG,
    ...FULL_SUPPLY,
    ...FULL_ALLOCATIONS,
    ...FULL_TRANSACTIONS,
    ...FULL_WALLET,
    ...FULL_BILLING,
    ...FULL_PAYMENTS,
    ...FULL_ANALYTICS,
    ...FULL_DEVELOPER,
    ...FULL_SUPPORT,
  ],

  // Admin - full authority except workspace.transfer and workspace.delete
  admin: [
    'workspace.complete_business_details',
    'workspace.view_settings',
    'workspace.update_settings',
    'workspace.trigger_go_live',
    'workspace.activate_service',
    'workspace.activate_benefits_catalog',
    'workspace.initiate_provider_activation',
    ...FULL_TEAM,
    ...FULL_MEMBERS,
    ...FULL_CATALOG,
    ...FULL_SUPPLY,
    ...FULL_ALLOCATIONS,
    ...FULL_TRANSACTIONS,
    ...FULL_WALLET,
    ...FULL_BILLING,
    ...FULL_PAYMENTS,
    ...FULL_ANALYTICS,
    ...FULL_DEVELOPER,
    ...FULL_SUPPORT,
  ],

  // Back-office manager (renamed from operator) - day-to-day ops, no pricing, no billing
  back_office_manager: [
    ...WORKSPACE_VIEW,
    'team.view_members',
    ...FULL_MEMBERS,
    'catalog.view',
    'catalog.adopt_offer',
    'catalog.exclude_offer',
    'catalog.manage_exposure',
    'catalog.manage_provider_selection',
    'catalog.manage_group_selection',
    'catalog.manage_campaigns',
    'catalog.view_pending_review',
    'allocations.view',
    'allocations.create',
    'allocations.update_draft',
    'allocations.execute',
    'allocations.cancel',
    'allocations.reclaim',
    'allocations.manage_audience_rules',
    ...VIEW_TRANSACTIONS,
    ...VIEW_WALLET,
    ...VIEW_ANALYTICS,
  ],

  // HR manager - people operations only
  hr_manager: [
    ...WORKSPACE_VIEW,
    ...FULL_MEMBERS,
    ...VIEW_WALLET,
    ...VIEW_ANALYTICS,
  ],

  // Finance - financial strategy, allocations, pricing, subsidies
  finance: [
    ...WORKSPACE_VIEW,
    ...VIEW_MEMBERS,
    'members.export',
    'catalog.view',
    'catalog.configure_pricing',
    ...FULL_ALLOCATIONS,
    ...VIEW_TRANSACTIONS,
    ...FULL_WALLET,
    'billing.view',
    'billing.view_invoices',
    'payments.view_transactions',
    'payments.view_settlement',
    'payments.view_payouts',
    'analytics.view_dashboards',
    'analytics.view_reports',
    'analytics.export_reports',
  ],

  // Billing manager - organization-side billing only
  billing_manager: [
    ...WORKSPACE_VIEW,
    ...FULL_BILLING,
    ...VIEW_ANALYTICS,
  ],

  // Payments manager - member-side payments, refunds, chargebacks
  payments_manager: [
    ...WORKSPACE_VIEW,
    ...VIEW_MEMBERS,
    ...FULL_TRANSACTIONS,
    ...VIEW_WALLET,
    ...FULL_PAYMENTS,
    ...VIEW_ANALYTICS,
  ],

  // Support agent - member-scoped support operations
  support_agent: [
    ...WORKSPACE_VIEW,
    ...VIEW_MEMBERS,
    'catalog.view',
    ...FULL_SUPPORT,
  ],

  // Developer - API keys, webhooks, integrations only
  developer: [
    ...WORKSPACE_VIEW,
    ...FULL_DEVELOPER,
  ],

  // Supply manager - provider supply and catalog (requires Provider service)
  supply_manager: [
    ...WORKSPACE_VIEW,
    'catalog.view',
    'catalog.view_pending_review',
    ...FULL_SUPPLY,
    ...VIEW_TRANSACTIONS,
    ...VIEW_ANALYTICS,
  ],

  // Member - end user acting on own data
  member: [
    'catalog.view',
    'wallet.view_member_balance',
    'transactions.view',
  ],

  // Deprecated - kept for backward compat; no new assignments should use operator
  operator: [
    ...WORKSPACE_VIEW,
    'team.view_members',
    ...FULL_MEMBERS,
    'catalog.view',
    'catalog.adopt_offer',
    'catalog.exclude_offer',
    'catalog.manage_exposure',
    'catalog.view_pending_review',
    'allocations.view',
    'allocations.create',
    'allocations.update_draft',
    'allocations.execute',
    'allocations.cancel',
    'allocations.reclaim',
    'allocations.manage_audience_rules',
    ...VIEW_TRANSACTIONS,
    ...VIEW_WALLET,
    ...VIEW_ANALYTICS,
  ],

  // Deprecated - replaced by finance + viewer modifier (Phase 2); no new assignments
  analyst: [],

  // Platform-side roles
  platform_admin: [
    'platform.view_all_tenants',
    'platform.suspend_workspace',
    'platform.unsuspend_workspace',
    'platform.approve_provider_activation',
    'platform.reject_provider_activation',
    'platform.set_nexus_pricing',
    'platform.view_settlement_reports',
    'platform.manage_platform_billing',
    'platform.recovery_decision',
    'platform.view_audit_log_cross_tenant',
    'platform.manage_global_config',
    'platform.assign_platform_role',
    'platform.cross_tenant_read',
    'platform.view_provider_relations',
    'platform.manage_provider_relations',
    'platform.send_platform_announcement',
    'platform.manage_platform_marketing',
  ],

  platform_operator: [
    'platform.view_all_tenants',
    'platform.suspend_workspace',
    'platform.unsuspend_workspace',
    'platform.recovery_decision',
    'platform.view_audit_log_cross_tenant',
    'platform.cross_tenant_read',
  ],

  platform_back_office: [
    'platform.view_all_tenants',
    'platform.approve_provider_activation',
    'platform.reject_provider_activation',
    'platform.view_provider_relations',
    'platform.cross_tenant_read',
    'platform.view_audit_log_cross_tenant',
  ],

  platform_marketing: [
    'platform.send_platform_announcement',
    'platform.manage_platform_marketing',
    'platform.view_all_tenants',
  ],

  platform_commerce: [
    'platform.view_provider_relations',
    'platform.manage_provider_relations',
    'platform.set_nexus_pricing',
    'platform.view_all_tenants',
    'platform.view_settlement_reports',
  ],

  platform_support: [
    'platform.cross_tenant_read',
    'platform.view_audit_log_cross_tenant',
  ],

  platform_finance: [
    'platform.view_settlement_reports',
    'platform.manage_platform_billing',
    'platform.view_audit_log_cross_tenant',
  ],
};

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Builds a deterministic id for one role-permission row.
 * Input: domain role and permission string.
 * Output: stable string id safe for repeated upserts.
 */
function rolePermissionId(role: TenantUserRoleName, permission: DomainPermission): string {
  return `role_permission_${role}_${permission.replace(/\./g, '_')}`;
}

/**
 * Returns the set of all role-permission ids that should exist after seeding.
 * Input: none.
 * Output: set used to identify stale rows for deletion.
 */
function getAllowedRolePermissionIds(): Set<string> {
  return new Set(
    Object.entries(ROLE_PERMISSIONS).flatMap(([role, permissions]) =>
      permissions.map((permission) =>
        rolePermissionId(role as TenantUserRoleName, permission as DomainPermission),
      ),
    ),
  );
}

/**
 * Upserts default role-permission records and deletes any stale rows.
 * Called on every backend startup to keep the DB in sync with this catalog.
 * Input: none.
 * Output: MongoDB RolePermissionMap collection reflects the current catalog.
 */
export async function ensureDefaultRolePermissions(): Promise<void> {
  const db = await getMongoDb();
  const collections = getIdentityDomainCollections(db);
  const now = new Date();
  const managedRoles = Object.keys(ROLE_PERMISSIONS) as TenantUserRoleName[];
  const allowedIds = getAllowedRolePermissionIds();

  const writes = Object.entries(ROLE_PERMISSIONS).flatMap(([role, permissions]) =>
    permissions.map((permission) => ({
      updateOne: {
        filter: { role: role as TenantUserRoleName, permission },
        update: {
          $setOnInsert: {
            rolePermissionMapId: rolePermissionId(
              role as TenantUserRoleName,
              permission as DomainPermission,
            ),
            role: role as TenantUserRoleName,
            permission,
            createdAt: now,
          },
          $set: { updatedAt: now },
        },
        upsert: true,
      },
    })),
  );

  if (writes.length > 0) {
    await collections.rolePermissionMaps.bulkWrite(writes, { ordered: false });
  }

  // Remove stale rows (permissions removed from the catalog or role bundles)
  const existingDefaults = await collections.rolePermissionMaps
    .find(
      { role: { $in: managedRoles } },
      { projection: { rolePermissionMapId: 1 } },
    )
    .toArray();

  const staleIds = existingDefaults
    .map((record) => record.rolePermissionMapId)
    .filter((id) => !allowedIds.has(id));

  if (staleIds.length > 0) {
    await collections.rolePermissionMaps.deleteMany({
      rolePermissionMapId: { $in: staleIds },
    });
  }
}
