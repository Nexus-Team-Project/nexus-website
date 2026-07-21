/**
 * Regex fallback engine - the same CatalogSearchEngine contract as the Atlas
 * engine with identical filter/sort/pagination semantics, minus typo
 * tolerance: text matches are case-insensitive contains-regexes on the offer
 * title + descriptionText and on the creator tenant's organizationName +
 * businessDescription (search mirror on domainTenants).
 *
 * Selected whenever ATLAS_SEARCH_ENABLED is false - tests (mongodb-memory-server
 * has no $search) and non-Atlas environments - and CI exercises the wallet feed
 * routes through it, so it is a first-class implementation, not a mock. The
 * Atlas engine also delegates its no-search-text path here (without a text
 * query the engines are definitionally identical).
 */
import type { Collection, Db, Document } from 'mongodb';
import { getMongoDb } from '../../config/mongo';
import { getSupplyDomainCollections, type NexusOffer } from '../../models/domain/supply.models';
import { getTenantDomainCollections } from '../../models/domain';
import {
  buildContextGates,
  buildUserFilterClauses,
  planSort,
  type SortPlan,
} from './query-parts.helper';
import type { CatalogSearchEngine, CatalogSearchRequest, CatalogSearchResult } from './types';

/** Max creator-tenant ids a tenant-name match may expand to (bounds the $in). */
export const TENANT_MATCH_CAP = 200;

/** Escapes regex specials so user text is always a literal contains-match. */
function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Two-step creator match: tenants whose name OR business description contains
 * the text resolve to ids, matched on offers.createdByTenantId (same pattern
 * as the dashboard orgSearch filter). Capped to bound the clause.
 */
async function matchCreatorTenantIds(db: Db, text: string): Promise<string[]> {
  const escaped = escapeRegex(text);
  const tenants = await getTenantDomainCollections(db).domainTenants
    .find(
      {
        $or: [
          { organizationName: { $regex: escaped, $options: 'i' } },
          { businessDescription: { $regex: escaped, $options: 'i' } },
        ],
      },
      { projection: { tenantId: 1 } },
    )
    .limit(TENANT_MATCH_CAP)
    .toArray();
  return tenants.map((t) => t.tenantId);
}

/**
 * Executes a plain find() under a sort plan. Shared shape for every non-$search
 * query: mongo-sorted pages use countDocuments + skip/limit; JS sorts fetch the
 * full matched set (bounded by the context) and paginate in memory.
 */
export async function executeFindPlan(
  collection: Collection<NexusOffer>,
  filter: Document,
  plan: SortPlan,
  page: number,
  limit: number,
): Promise<CatalogSearchResult> {
  const skip = (page - 1) * limit;
  if (plan.mode === 'js') {
    const all = await collection.find(filter).toArray();
    all.sort(plan.compare);
    return { offers: all.slice(skip, skip + limit), total: all.length };
  }
  // 'score' never reaches a find() path (planSort only yields it when the
  // engine scores, and $search queries go through the aggregation path).
  const sort = plan.mode === 'mongo' ? plan.sort : { createdAt: -1 as const };
  let cursor = collection.find(filter).sort(sort);
  if (plan.mode === 'mongo' && plan.collation) cursor = cursor.collation(plan.collation);
  const [total, offers] = await Promise.all([
    collection.countDocuments(filter),
    cursor.skip(skip).limit(limit).toArray(),
  ]);
  return { offers, total };
}

export const regexEngine: CatalogSearchEngine = {
  name: 'regex-fallback',

  async search(request: CatalogSearchRequest): Promise<CatalogSearchResult> {
    const db = await getMongoDb();
    const { nexusOffers } = getSupplyDomainCollections(db);
    const { context, query } = request;

    const andClauses: Array<Record<string, unknown>> = [
      ...buildContextGates(context, new Date()),
      ...(await buildUserFilterClauses(db, query)),
    ];

    const text = query.search?.trim().slice(0, 200);
    if (text) {
      const creatorIds = await matchCreatorTenantIds(db, text);
      const escaped = escapeRegex(text);
      andClauses.push({
        $or: [
          { title: { $regex: escaped, $options: 'i' } },
          { descriptionText: { $regex: escaped, $options: 'i' } },
          ...(creatorIds.length > 0 ? [{ createdByTenantId: { $in: creatorIds } }] : []),
        ],
      });
    }

    const plan = planSort(context, query, /* engineScores */ false);
    return executeFindPlan(nexusOffers, { $and: andClauses }, plan, query.page, query.limit);
  },
};
