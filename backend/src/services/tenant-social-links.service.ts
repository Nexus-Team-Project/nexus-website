/**
 * Tenant social-media handles (Instagram/Facebook/X). Each field independently:
 * `undefined` leaves it untouched, `null` clears it, a string sets it. Stored
 * value is always a bare handle - never a URL/domain - per
 * `schemas/socialHandle.schemas.ts`'s structural safety property.
 */
import { Db } from 'mongodb';
import { getTenantDomainCollections } from '../models/domain';

export interface TenantSocialLinksUpdate {
  tenantId: string;
  instagramHandle?: string | null;
  facebookHandle?: string | null;
  twitterHandle?: string | null;
}

export interface TenantSocialLinks {
  instagramHandle: string | null;
  facebookHandle: string | null;
  twitterHandle: string | null;
}

const HANDLE_FIELDS = ['instagramHandle', 'facebookHandle', 'twitterHandle'] as const;

/**
 * Apply a partial update to a tenant's social handles.
 * @returns the resulting value of every handle field (null when absent).
 */
export async function setTenantSocialLinks(
  db: Db,
  args: TenantSocialLinksUpdate,
): Promise<TenantSocialLinks> {
  const { domainTenants } = getTenantDomainCollections(db);

  const setFields: Record<string, string> = {};
  const unsetFields: Record<string, ''> = {};
  for (const field of HANDLE_FIELDS) {
    const value = args[field];
    if (value === undefined) continue;
    if (value === null) unsetFields[field] = '';
    else setFields[field] = value;
  }

  const update: Record<string, unknown> = { $set: { ...setFields, updatedAt: new Date() } };
  if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;

  await domainTenants.updateOne({ tenantId: args.tenantId }, update);

  const tenant = await domainTenants.findOne(
    { tenantId: args.tenantId },
    { projection: { instagramHandle: 1, facebookHandle: 1, twitterHandle: 1 } },
  );
  return {
    instagramHandle: (tenant?.instagramHandle as string | undefined) ?? null,
    facebookHandle: (tenant?.facebookHandle as string | undefined) ?? null,
    twitterHandle: (tenant?.twitterHandle as string | undefined) ?? null,
  };
}
