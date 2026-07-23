/**
 * Wallet contact-match discovery (match screen data source, spec 7b).
 * Reverse lookup: which tenants listed the CALLER's verified identifiers
 * (normalizedEmail / phone) in their tenantContacts, filtered to tenants with
 * an ACTIVE benefits catalog, excluding tenants the caller already belongs to.
 * Returns ONLY tenant public branding - contact-row data never leaves here.
 * Backed by the global partial indexes contact_email_global / contact_phone_global.
 */
import type { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import type { LogoCrop } from '../../models/domain/tenant.models';
import { activeCatalogTenantIds } from './tenant-discovery.service';

/** Public branding of one matched tenant - the full response row. */
export interface ContactMatchTenant {
  tenantId: string;
  name: string;
  logoUrl?: string;
  logoCrop?: LogoCrop | null;
  brandColor?: string;
}

const MAX_MATCHES = 50; // ponytail: hard cap; paging if match lists ever grow past this

/**
 * Find tenants whose contact lists mention the caller.
 * @param db Mongo handle.
 * @param args.nexusIdentityId the CALLER's identity id (membership exclusion).
 * @param args.normalizedEmail the caller's session-verified email (always used).
 * @param args.phone the caller's OTP-verified phone, if any (union with email).
 * @returns branding rows sorted by name, capped at MAX_MATCHES.
 */
export async function findContactMatchTenants(
  db: Db,
  args: { nexusIdentityId: string; normalizedEmail: string; phone?: string },
): Promise<ContactMatchTenant[]> {
  const or: Record<string, unknown>[] = [{ normalizedEmail: args.normalizedEmail }];
  if (args.phone) or.push({ phone: args.phone });

  // Union of email + phone hits; distinct dedups tenants matched by both.
  const hitTenantIds = (await db
    .collection(DOMAIN_COLLECTIONS.tenantContacts)
    .distinct('tenantId', { $or: or })) as string[];
  if (hitTenantIds.length === 0) return [];

  // Only tenants with an active benefits catalog are joinable (batch $in).
  const activeIds = await activeCatalogTenantIds(db, hitTenantIds);

  // Exclude tenants the caller already belongs to (any membership status -
  // an existing row means the join/match flow is not the way in).
  const memberTenantIds = new Set(
    (await db
      .collection(DOMAIN_COLLECTIONS.tenantMembers)
      .distinct('tenantId', { nexusIdentityId: args.nexusIdentityId })) as string[],
  );

  const finalIds = hitTenantIds.filter((id) => activeIds.has(id) && !memberTenantIds.has(id));
  if (finalIds.length === 0) return [];

  const tenants = await db
    .collection<{
      tenantId: string;
      organizationName?: string;
      logoUrl?: string;
      logoCrop?: LogoCrop | null;
      brandColor?: string;
    }>(DOMAIN_COLLECTIONS.domainTenants)
    .find({ tenantId: { $in: finalIds } })
    .project<{
      tenantId: string;
      organizationName?: string;
      logoUrl?: string;
      logoCrop?: LogoCrop | null;
      brandColor?: string;
    }>({ tenantId: 1, organizationName: 1, logoUrl: 1, logoCrop: 1, brandColor: 1 })
    .sort({ organizationName: 1 })
    .limit(MAX_MATCHES)
    .toArray();

  return tenants
    .filter((t) => (t.organizationName ?? '').trim().length > 0)
    .map((t) => ({
      tenantId: t.tenantId,
      name: t.organizationName!.trim(),
      ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
      ...(t.logoCrop != null ? { logoCrop: t.logoCrop } : {}),
      ...(t.brandColor ? { brandColor: t.brandColor } : {}),
    }));
}
