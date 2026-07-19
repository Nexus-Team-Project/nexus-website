/**
 * Tenant rating lifecycle: any authenticated wallet user may submit or
 * update their own 1-5 star rating of a tenant; the aggregate (average,
 * count, star distribution) is read by the public tenant lookup so anyone
 * viewing the tenant page sees it, even anonymously.
 */
import { Db } from 'mongodb';
import {
  TENANT_RATING_COLLECTION,
  type TenantRatingDocument,
  type TenantRatingValue,
} from '../../models/domain/tenant-rating.models';

export interface TenantRatingSummary {
  average: number;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/**
 * Aggregate a tenant's ratings into an average + per-star distribution.
 *
 * @param db       Mongo handle
 * @param tenantId domain tenantId
 * @returns null when nobody has rated this tenant yet (never a fake 0.0)
 */
export async function getTenantRatingSummary(
  db: Db,
  tenantId: string,
): Promise<TenantRatingSummary | null> {
  const rows = await db
    .collection<TenantRatingDocument>(TENANT_RATING_COLLECTION)
    .aggregate<{ _id: TenantRatingValue; count: number }>([
      { $match: { tenantId } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ])
    .toArray();

  const distribution: TenantRatingSummary['distribution'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let total = 0;
  let sum = 0;
  for (const row of rows) {
    const key = String(row._id) as keyof TenantRatingSummary['distribution'];
    distribution[key] = row.count;
    total += row.count;
    sum += row._id * row.count;
  }
  if (total === 0) return null;

  return { average: sum / total, count: total, distribution };
}

/**
 * Read one member's own rating for a tenant.
 *
 * @returns the rating value, or null when they have not rated it
 */
export async function getMyTenantRating(
  db: Db,
  args: { tenantId: string; nexusIdentityId: string },
): Promise<number | null> {
  const doc = await db
    .collection<TenantRatingDocument>(TENANT_RATING_COLLECTION)
    .findOne({ tenantId: args.tenantId, nexusIdentityId: args.nexusIdentityId }, { projection: { rating: 1 } });
  return doc?.rating ?? null;
}

/**
 * Submit or update a member's own rating for a tenant (upsert by
 * tenantId + nexusIdentityId - one rating per person per tenant).
 */
export async function submitTenantRating(
  db: Db,
  args: { tenantId: string; nexusIdentityId: string; rating: TenantRatingValue },
): Promise<void> {
  const now = new Date();
  await db.collection<TenantRatingDocument>(TENANT_RATING_COLLECTION).updateOne(
    { tenantId: args.tenantId, nexusIdentityId: args.nexusIdentityId },
    {
      $setOnInsert: {
        tenantId: args.tenantId,
        nexusIdentityId: args.nexusIdentityId,
        createdAt: now,
      },
      $set: { rating: args.rating, updatedAt: now },
    },
    { upsert: true },
  );
}
