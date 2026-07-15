/**
 * Pure helpers for the M8 business-setup approval sub-doc (domain Tenant). No DB.
 *
 * A tenant that submits business setup enters a NEXUS-admin approval queue: its
 * domain tenant carries `businessSetupApproval` = { status, reason?, devMode?,
 * submittedAt?, reviewedByEmail?, reviewedAt? }. Approved gates production (and,
 * via the dev shortcut, development) global-offer publish + Go Live.
 */

/** The approval sub-doc stored on a domain Tenant. */
export type BusinessSetupApproval = {
  status: 'pending' | 'approved' | 'denied';
  reason?: string;
  devMode?: boolean;
  submittedAt?: Date;
  reviewedByEmail?: string;
  reviewedAt?: Date;
};

/**
 * Fresh pending approval to store when business setup is submitted. Re-submitting
 * after edits overwrites the whole sub-doc, so any prior reason/review is cleared.
 * Input: current time. Output: a `{ status:'pending', submittedAt }` object.
 */
export function nextApprovalOnSubmit(now: Date): { status: 'pending'; submittedAt: Date } {
  return { status: 'pending', submittedAt: now };
}

/**
 * True only when a platform admin has approved. Null/absent = not approved.
 * Input: the approval sub-doc (or null). Output: boolean.
 */
export function isApproved(a: Pick<BusinessSetupApproval, 'status'> | null | undefined): boolean {
  return a?.status === 'approved';
}

/**
 * Maps the approval sub-doc to the `/api/me` authorization fields.
 * Input: the approval sub-doc (or null). Output: the three derived flags.
 */
export function approvalAuthFields(a: BusinessSetupApproval | null | undefined): {
  businessSetupApproved: boolean;
  businessSetupApprovalStatus: 'pending' | 'approved' | 'denied' | null;
  businessSetupApprovalReason: string | null;
} {
  return {
    businessSetupApproved: a?.status === 'approved',
    businessSetupApprovalStatus: a?.status ?? null,
    businessSetupApprovalReason: a?.status === 'denied' ? (a.reason ?? null) : null,
  };
}

/**
 * True when a caller may CREATE an offer (M9). Platform admins always may (they
 * upload on behalf); a non-admin tenant may only when its business setup is
 * approved. Input: isPlatformAdmin, approved. Output: boolean.
 */
export function canTenantCreateOffer(isPlatformAdmin: boolean, approved: boolean): boolean {
  return isPlatformAdmin || approved;
}
