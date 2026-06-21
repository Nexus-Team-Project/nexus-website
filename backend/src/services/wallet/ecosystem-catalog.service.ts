/**
 * Wallet "everyone's catalog" feed. Returns ecosystem-approved offers
 * excluding offers adopted by ANY tenant the calling user belongs to.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 9 + phone-otp.md "Pricing in everyone's catalog"
 */
import { Db } from 'mongodb';
import { DOMAIN_COLLECTIONS } from '../../models/domain/collections';
import { NOT_DELETED } from '../../models/domain/supply.models';

export interface EcosystemCatalogItem {
  id: string;
  title: string;
  description?: string;
  category?: string;
  imageUrls?: string[];
  imageUrl?: string;
  market_price?: number;
  member_price?: number;
  face_value?: number;
  displayPrice?: number;
  validUntil?: string;
  tags?: string[];
  visibility: 'ecosystem';
}

export interface EcosystemCatalogResult {
  items: EcosystemCatalogItem[];
  total: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Read the wallet user's tenant ids (any role) and exclude offers they
 * already see through any of those tenants. Returns at most `limit`
 * items.
 */
export async function getEcosystemCatalogForWallet(
  db: Db,
  args: { nexusIdentityId: string; query?: string; limit?: number },
): Promise<EcosystemCatalogResult> {
  const cap = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Tenants the user belongs to.
  const userTenants = await db
    .collection<{ tenantId: string }>(DOMAIN_COLLECTIONS.tenantUserRoles)
    .distinct('tenantId', { nexusIdentityId: args.nexusIdentityId });

  // Offers any of those tenants have adopted.
  const adoptedOfferIds =
    userTenants.length > 0
      ? await db
          .collection<{ offerId: string; tenantId: string; adoptionStatus: string }>(
            DOMAIN_COLLECTIONS.tenantOfferConfigs,
          )
          .distinct('offerId', {
            tenantId: { $in: userTenants },
            adoptionStatus: 'active',
          })
      : [];

  const filter: Record<string, unknown> = {
    visibility: 'ecosystem',
    status: 'active',
    ...NOT_DELETED,
  };
  if (adoptedOfferIds.length > 0) {
    filter.offerId = { $nin: adoptedOfferIds };
  }
  if (args.query?.trim()) {
    const escaped = args.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = { $regex: escaped, $options: 'i' };
    filter.$or = [{ title: re }, { description: re }];
  }

  const offers = db.collection(DOMAIN_COLLECTIONS.nexusOffers);
  const [total, docs] = await Promise.all([
    offers.countDocuments(filter),
    offers
      .find(filter, {
        projection: {
          offerId: 1,
          title: 1,
          description: 1,
          category: 1,
          imageUrls: 1,
          imageUrl: 1,
          market_price: 1,
          member_price: 1,
          face_value: 1,
          displayPrice: 1,
          validUntil: 1,
          tags: 1,
          visibility: 1,
        },
      })
      .sort({ createdAt: -1 })
      .limit(cap)
      .toArray(),
  ]);

  const items: EcosystemCatalogItem[] = docs.map((o) => ({
    id: o.offerId,
    title: o.title ?? '',
    description: o.description,
    category: o.category,
    imageUrls: o.imageUrls,
    imageUrl: o.imageUrl,
    market_price: o.market_price,
    member_price: o.member_price,
    face_value: o.face_value,
    displayPrice: o.displayPrice,
    validUntil: o.validUntil instanceof Date ? o.validUntil.toISOString() : o.validUntil,
    tags: o.tags,
    visibility: 'ecosystem',
  }));

  return { items, total };
}
