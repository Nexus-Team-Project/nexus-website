/**
 * Decides whether a login belongs to a privileged tenant user (any
 * non-'member' role on an ACTIVE membership). Privileged logins on
 * unrecognized devices require the email-OTP second factor.
 * Read-only; at most three indexed Mongo queries.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { Db } from 'mongodb';
import { getIdentityDomainCollections } from '../../models/domain/identity.models';
import { getTenantDomainCollections } from '../../models/domain/tenant.models';

/**
 * True when the email's identity holds a non-'member' role in any tenant
 * where its membership is active.
 * Input: mongo handle + raw email (normalized here).
 * Output: boolean privilege decision for the login flow.
 */
export async function userHasPrivilegedTenantRole(db: Db, email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const identity = getIdentityDomainCollections(db);
  const tenants = getTenantDomainCollections(db);

  const identityDoc = await identity.nexusIdentities.findOne(
    { normalizedEmail },
    { projection: { nexusIdentityId: 1 } },
  );
  if (!identityDoc) return false;

  const memberships = await tenants.tenantMembers
    .find({ nexusIdentityId: identityDoc.nexusIdentityId, status: 'active' }, { projection: { tenantId: 1 } })
    .toArray();
  if (memberships.length === 0) return false;

  const privileged = await identity.tenantUserRoles.findOne({
    nexusIdentityId: identityDoc.nexusIdentityId,
    tenantId: { $in: memberships.map((m) => m.tenantId) },
    role: { $ne: 'member' },
  });
  return privileged !== null;
}
