/**
 * Atlas Search engine - typo-tolerant text matching via $search aggregations.
 *
 * Query shape (text queries only; no-text requests delegate to the regex
 * engine, which is definitionally identical without a text query):
 *   1. Resolve creator tenants matching the text (fuzzy, tenants_search index
 *      on domainTenants: organizationName + the businessDescription mirror),
 *      capped like the regex engine's two-step.
 *   2. One $search over offers_search: compound.should of a fuzzy text match
 *      on title/descriptionText and an `in` on createdByTenantId (the tenant
 *      union) - minimumShouldMatch 1, so either leg qualifies and both score.
 *   3. $match the context gates + user filters AFTER $search - gates are never
 *      search-scored, so a fuzzy match can never leak a gated offer.
 *   4. Order per the sort plan: score = natural $search order; mongo = $sort
 *      (+ Hebrew collation for title); js = fetch matched set, sort in memory.
 *
 * The pipeline builders are exported pure for unit tests ($search itself only
 * runs on Atlas; CI covers the routes through the regex engine).
 */
import type { Document } from 'mongodb';
import { getMongoDb } from '../../config/mongo';
import { getSupplyDomainCollections, type NexusOffer } from '../../models/domain/supply.models';
import { getTenantDomainCollections } from '../../models/domain';
import { OFFERS_SEARCH_INDEX, TENANTS_SEARCH_INDEX } from './search-indexes';
import {
  buildContextGates,
  buildUserFilterClauses,
  planSort,
} from './query-parts.helper';
import { regexEngine, TENANT_MATCH_CAP } from './regex-engine';
import type { CatalogSearchEngine, CatalogSearchRequest, CatalogSearchResult } from './types';

/** Fuzzy tuning: 1 edit, first letter exact. Tuned during the manual pass. */
export const FUZZY_CONFIG = { maxEdits: 1, prefixLength: 1 } as const;

/** Pipeline resolving creator tenantIds whose name/description match the text. */
export function buildTenantsSearchPipeline(text: string): Document[] {
  return [
    {
      $search: {
        index: TENANTS_SEARCH_INDEX,
        text: {
          query: text,
          path: ['organizationName', 'businessDescription'],
          fuzzy: FUZZY_CONFIG,
        },
      },
    },
    { $limit: TENANT_MATCH_CAP },
    { $project: { _id: 0, tenantId: 1 } },
  ];
}

/**
 * The offers $search stage: fuzzy text on title/descriptionText unioned with
 * the creator-tenant ids (when any matched). Gates/filters are NOT here - they
 * $match afterwards so scoring never gates.
 */
export function buildOffersSearchStage(text: string, creatorTenantIds: string[]): Document {
  return {
    $search: {
      index: OFFERS_SEARCH_INDEX,
      compound: {
        should: [
          {
            text: {
              query: text,
              path: ['title', 'descriptionText'],
              fuzzy: FUZZY_CONFIG,
            },
          },
          ...(creatorTenantIds.length > 0
            ? [{ in: { path: 'createdByTenantId', value: creatorTenantIds } }]
            : []),
        ],
        minimumShouldMatch: 1,
      },
    },
  };
}

export const atlasEngine: CatalogSearchEngine = {
  name: 'atlas-search',

  async search(request: CatalogSearchRequest): Promise<CatalogSearchResult> {
    const { context, query } = request;
    const text = query.search?.trim().slice(0, 200);
    // Without a text query the engines are identical - reuse the find() path.
    if (!text) return regexEngine.search(request);

    const db = await getMongoDb();
    const { nexusOffers } = getSupplyDomainCollections(db);

    const creatorTenantIds = (
      await getTenantDomainCollections(db).domainTenants
        .aggregate<{ tenantId: string }>(buildTenantsSearchPipeline(text))
        .toArray()
    ).map((t) => t.tenantId);

    const basePipeline: Document[] = [
      buildOffersSearchStage(text, creatorTenantIds),
      {
        $match: {
          $and: [
            ...buildContextGates(context, new Date()),
            ...(await buildUserFilterClauses(db, query)),
          ],
        },
      },
    ];

    const plan = planSort(context, query, /* engineScores */ true);
    const skip = (query.page - 1) * query.limit;

    if (plan.mode === 'js') {
      // Effective-value sorts need the full matched set (bounded by the context).
      const all = await nexusOffers.aggregate<NexusOffer>(basePipeline).toArray();
      all.sort(plan.compare);
      return { offers: all.slice(skip, skip + query.limit), total: all.length };
    }

    // score = natural $search order (no $sort stage); mongo = explicit $sort.
    const pagedPipeline: Document[] = [
      ...basePipeline,
      ...(plan.mode === 'mongo' ? [{ $sort: plan.sort }] : []),
      {
        $facet: {
          page: [{ $skip: skip }, { $limit: query.limit }],
          total: [{ $count: 'n' }],
        },
      },
    ];
    const collation = plan.mode === 'mongo' ? plan.collation : undefined;
    const [facet] = await nexusOffers
      .aggregate<{ page: NexusOffer[]; total: Array<{ n: number }> }>(
        pagedPipeline,
        collation ? { collation } : undefined,
      )
      .toArray();
    return { offers: facet?.page ?? [], total: facet?.total[0]?.n ?? 0 };
  },
};
