/**
 * Pure shape tests for the Atlas engine's $search pipeline builders ($search
 * itself only runs on Atlas - CI covers the route path via the regex engine)
 * plus the sort planner and cache key stability.
 */
import { describe, it, expect } from 'vitest';
import {
  buildOffersSearchStage,
  buildTenantsSearchPipeline,
  FUZZY_CONFIG,
} from '../../src/services/catalog-search/atlas-engine';
import { planSort } from '../../src/services/catalog-search/query-parts.helper';
import { searchCacheKey } from '../../src/services/catalog-search/cache';
import type { CatalogSearchContext } from '../../src/services/catalog-search/types';

const ecosystem: CatalogSearchContext = { kind: 'ecosystem' };
const tenant: CatalogSearchContext = {
  kind: 'tenant', tenantId: 't1', adoptedOfferIds: ['o1'], overrides: new Map(),
};

describe('buildOffersSearchStage', () => {
  it('fuzzy text on title+descriptionText, union with creator ids, either leg qualifies', () => {
    const stage = buildOffersSearchStage('coffe', ['tA', 'tB']) as {
      $search: { index: string; compound: { should: unknown[]; minimumShouldMatch: number } };
    };
    expect(stage.$search.index).toBe('offers_search');
    expect(stage.$search.compound.minimumShouldMatch).toBe(1);
    expect(stage.$search.compound.should).toEqual([
      { text: { query: 'coffe', path: ['title', 'descriptionText'], fuzzy: FUZZY_CONFIG } },
      { in: { path: 'createdByTenantId', value: ['tA', 'tB'] } },
    ]);
  });

  it('omits the tenant leg when no creators matched', () => {
    const stage = buildOffersSearchStage('coffe', []) as {
      $search: { compound: { should: unknown[] } };
    };
    expect(stage.$search.compound.should).toHaveLength(1);
  });
});

describe('buildTenantsSearchPipeline', () => {
  it('fuzzy over name + description mirror, capped, id-only projection', () => {
    const pipeline = buildTenantsSearchPipeline('neto');
    expect(pipeline[0]).toEqual({
      $search: {
        index: 'tenants_search',
        text: { query: 'neto', path: ['organizationName', 'businessDescription'], fuzzy: FUZZY_CONFIG },
      },
    });
    expect(pipeline[1]).toEqual({ $limit: 200 });
    expect(pipeline[2]).toEqual({ $project: { _id: 0, tenantId: 1 } });
  });
});

describe('planSort', () => {
  it('Relevant = score order only while searching on a scoring engine', () => {
    expect(planSort(ecosystem, { page: 1, limit: 10, search: 'x' }, true)).toEqual({ mode: 'score' });
    expect(planSort(ecosystem, { page: 1, limit: 10, search: 'x' }, false))
      .toMatchObject({ mode: 'mongo', sort: { createdAt: -1 } });
    expect(planSort(ecosystem, { page: 1, limit: 10 }, true))
      .toMatchObject({ mode: 'mongo', sort: { createdAt: -1 } });
  });

  it('an explicit newest beats score order even while searching', () => {
    expect(planSort(ecosystem, { page: 1, limit: 10, search: 'x', sort: 'newest' }, true))
      .toMatchObject({ mode: 'mongo' });
  });

  it('cashback: ecosystem desc = indexed Mongo sort, asc + tenant = JS', () => {
    expect(planSort(ecosystem, { page: 1, limit: 10, sort: 'cashback_desc' }, false))
      .toMatchObject({ mode: 'mongo', sort: { cashbackMaxPct: -1, createdAt: -1 } });
    expect(planSort(ecosystem, { page: 1, limit: 10, sort: 'cashback_asc' }, false).mode).toBe('js');
    expect(planSort(tenant, { page: 1, limit: 10, sort: 'cashback_desc' }, false).mode).toBe('js');
  });

  it('title_asc carries the Hebrew collation', () => {
    expect(planSort(ecosystem, { page: 1, limit: 10, sort: 'title_asc' }, false))
      .toMatchObject({ mode: 'mongo', sort: { title: 1, createdAt: -1 }, collation: { locale: 'he' } });
  });
});

describe('searchCacheKey', () => {
  it('separates contexts and queries, stable for identical requests', () => {
    const q = { page: 1, limit: 30, search: 'coffee' };
    const a = searchCacheKey({ context: tenant, query: q });
    const b = searchCacheKey({ context: tenant, query: { ...q } });
    const c = searchCacheKey({ context: ecosystem, query: q });
    const d = searchCacheKey({ context: tenant, query: { ...q, page: 2 } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
});
