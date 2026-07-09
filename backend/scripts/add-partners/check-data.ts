// Sanity check for partner data files: unique slugs/titles + full search-terms coverage.
// Run: npx tsx scripts/add-partners/check-data.ts (from nexus-website/backend)
import { NEW_PARTNERS } from './partners.data';
import { PARTNER_SEARCH_TERMS } from './search-terms.data';

const slugs = new Set(NEW_PARTNERS.map((x) => x.slug));
const titles = new Set(NEW_PARTNERS.map((x) => x.title));
const missing = NEW_PARTNERS.filter((x) => !PARTNER_SEARCH_TERMS[x.title]).map((x) => x.title);
console.log(
  `entries ${NEW_PARTNERS.length} | unique slugs ${slugs.size} | unique titles ${titles.size} | map keys ${Object.keys(PARTNER_SEARCH_TERMS).length} | new without terms: ${missing.length ? missing.join(', ') : 'none'}`,
);
if (slugs.size !== NEW_PARTNERS.length || titles.size !== NEW_PARTNERS.length || missing.length) process.exit(1);
