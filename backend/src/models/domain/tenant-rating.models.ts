/**
 * Mongo collection for member ratings of a tenant. Any authenticated wallet
 * user may rate a tenant 1-5 stars; one rating per (tenantId, identity),
 * upserted on resubmit. Aggregated into an average + star distribution and
 * surfaced on the public tenant lookup (public-tenant.service.ts).
 */
import { Db, ObjectId } from 'mongodb';

export const TENANT_RATING_COLLECTION = 'tenantRatings';

export type TenantRatingValue = 1 | 2 | 3 | 4 | 5;

/** A single member's rating of a tenant. */
export interface TenantRatingDocument {
  _id?: ObjectId;
  tenantId: string;
  /** Domain identity id (NOT prisma user id) of the rater. */
  nexusIdentityId: string;
  rating: TenantRatingValue;
  createdAt: Date;
  updatedAt: Date;
}

export async function ensureTenantRatingIndexes(db: Db): Promise<void> {
  const col = db.collection<TenantRatingDocument>(TENANT_RATING_COLLECTION);
  // One rating per person per tenant; also the upsert target for resubmits.
  await col.createIndex(
    { tenantId: 1, nexusIdentityId: 1 },
    { name: 'tenant_identity_unique', unique: true },
  );
  // Aggregation: group a tenant's ratings by star value.
  await col.createIndex({ tenantId: 1, rating: 1 }, { name: 'tenant_rating' });
}
