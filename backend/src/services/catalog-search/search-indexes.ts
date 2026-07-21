/**
 * Atlas Search index definitions, managed in code like the B-tree indexes in
 * models/domain/indexes.ts: `ensureSearchIndexes` runs at bootstrap (only when
 * ATLAS_SEARCH_ENABLED) and creates whichever of the two indexes is missing.
 *
 * Budget note: M0 (free tier) allows at most 3 Atlas Search indexes per
 * cluster - this module uses 2 (offers + tenants), leaving 1 spare. That is
 * why tenant search reads the businessDescription MIRROR on domainTenants
 * instead of a third index on tenantProfiles.
 *
 * Mappings are static (dynamic: false) so the index stays minimal:
 *   offers_search  - title + descriptionText (fuzzy text), createdByTenantId
 *                    as a token (the tenant-union `in` operator needs it).
 *   tenants_search - organizationName + businessDescription (fuzzy text).
 *
 * Index builds are asynchronous on Atlas: a freshly created index serves
 * queries only once built, and new documents appear in results after a short
 * indexing delay - acceptable (browse queries never touch $search).
 * Failures here are logged, never thrown: search-index trouble must not block
 * boot (the routes keep working; only fuzzy quality degrades until fixed).
 */
import type { Collection, Db, Document } from 'mongodb';
import { getSupplyDomainCollections } from '../../models/domain/supply.models';
import { getTenantDomainCollections } from '../../models/domain';

export const OFFERS_SEARCH_INDEX = 'offers_search';
export const TENANTS_SEARCH_INDEX = 'tenants_search';

const OFFERS_SEARCH_DEFINITION: Document = {
  mappings: {
    dynamic: false,
    fields: {
      title: { type: 'string' },
      descriptionText: { type: 'string' },
      createdByTenantId: { type: 'token' },
    },
  },
};

const TENANTS_SEARCH_DEFINITION: Document = {
  mappings: {
    dynamic: false,
    fields: {
      organizationName: { type: 'string' },
      businessDescription: { type: 'string' },
    },
  },
};

/** Creates one search index unless a same-named one already exists. */
async function ensureOne(
  collection: Collection<never> | Collection<Document>,
  name: string,
  definition: Document,
): Promise<void> {
  const existing = await (collection as Collection<Document>).listSearchIndexes().toArray();
  if (existing.some((idx) => idx.name === name)) return;
  await (collection as Collection<Document>).createSearchIndex({ name, definition });
  console.log(`[CATALOG-SEARCH] created Atlas Search index '${name}' (build is async)`);
}

/**
 * Ensures both Atlas Search indexes exist. Call at bootstrap ONLY when
 * ATLAS_SEARCH_ENABLED - the commands are Atlas-only. Never throws.
 */
export async function ensureSearchIndexes(db: Db): Promise<void> {
  try {
    await ensureOne(
      getSupplyDomainCollections(db).nexusOffers as unknown as Collection<Document>,
      OFFERS_SEARCH_INDEX,
      OFFERS_SEARCH_DEFINITION,
    );
    await ensureOne(
      getTenantDomainCollections(db).domainTenants as unknown as Collection<Document>,
      TENANTS_SEARCH_INDEX,
      TENANTS_SEARCH_DEFINITION,
    );
  } catch (error) {
    console.error(
      '[CATALOG-SEARCH] Atlas Search index setup failed - $search queries may error until fixed:',
      error,
    );
  }
}
