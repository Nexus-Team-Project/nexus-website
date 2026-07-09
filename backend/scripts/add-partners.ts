/**
 * Purpose: idempotent partner data updater for the /partners page.
 *
 * 1. Renames the misspelled 'Homonugus' row to 'Humongous'.
 * 2. Inserts NEW_PARTNERS rows that do not already exist (matched by exact title,
 *    case/space-insensitive).
 * 3. Backfills bilingual searchTerms on EVERY partner row from PARTNER_SEARCH_TERMS.
 *
 * Never deletes rows. Dry-run by default; pass --apply to write.
 * Run from nexus-website/backend: npx tsx scripts/add-partners.ts [--apply]
 * Spec: docs/superpowers/specs/2026-07-09-partners-csv-orgs-design.md
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { NEW_PARTNERS, PINNED_ORDERS } from './add-partners/partners.data';
import { PARTNER_SEARCH_TERMS } from './add-partners/search-terms.data';

const prisma = new PrismaClient();

/** Normalizes a title for duplicate matching (trim, lowercase, collapse spaces). */
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Order-sensitive string-array equality (search terms are stored in a fixed order). */
const sameTerms = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Runs the three idempotent phases (rename, insert, backfill).
 * Inputs: --apply CLI flag (writes) or none (dry-run); DATABASE_URL env.
 * Output: console summary of planned/performed writes; exit code 1 on failure.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  // Phase 1: spelling fix.
  const misspelled = await prisma.partner.findFirst({ where: { title: 'Homonugus' } });
  if (misspelled) {
    console.log('Rename: Homonugus -> Humongous');
    if (apply) await prisma.partner.update({ where: { id: misspelled.id }, data: { title: 'Humongous' } });
  }

  // Phase 2: insert missing partners.
  const existing = await prisma.partner.findMany({ select: { title: true, order: true } });
  const existingTitles = new Set(existing.map((p) => norm(p.title)));
  if (misspelled) existingTitles.add(norm('Humongous')); // dry-run parity with post-rename state
  const nextOrder = existing.reduce((max, p) => Math.max(max, p.order), 0) + 1;

  const toInsert = NEW_PARTNERS.filter((p) => !existingTitles.has(norm(p.title)));
  console.log(`Existing partners: ${existing.length}`);
  console.log(`New entries in data file: ${NEW_PARTNERS.length}`);
  console.log(`Already present (skipped): ${NEW_PARTNERS.length - toInsert.length}`);
  console.log(`To insert: ${toInsert.length}`);
  for (const p of toInsert) console.log(`  + ${p.title} [${p.categories.join(', ')}] -> /partners/${p.slug}.png`);

  if (apply && toInsert.length > 0) {
    const created = await prisma.partner.createMany({
      data: toInsert.map((p, i) => ({
        title: p.title,
        thumbnailUrl: `/partners/${p.slug}.png`,
        categories: p.categories,
        discount: p.discount,
        isActive: true,
        order: nextOrder + i,
      })),
    });
    console.log(`Inserted ${created.count} partners.`);
  }

  // Phase 3: searchTerms backfill on every row (post-rename, post-insert state).
  // In --apply mode rows are re-read AFTER insert; dry-run simulates the new rows.
  const rows = await prisma.partner.findMany({ select: { id: true, title: true, searchTerms: true } });
  const all = apply
    ? rows
    : rows.concat(toInsert.map((p) => ({ id: `(new) ${p.slug}`, title: p.title, searchTerms: [] as string[] })));
  let updates = 0;
  const unmapped: string[] = [];
  for (const row of all) {
    const canonical = !apply && row.title === 'Homonugus' ? 'Humongous' : row.title;
    const desired = PARTNER_SEARCH_TERMS[canonical];
    if (!desired) {
      unmapped.push(row.title);
      continue;
    }
    if (sameTerms(row.searchTerms ?? [], desired)) continue;
    updates++;
    if (apply) await prisma.partner.update({ where: { id: row.id }, data: { searchTerms: desired } });
  }
  console.log(`searchTerms updates: ${updates}`);
  if (unmapped.length) console.warn(`WARN - titles with no search-terms mapping: ${unmapped.join(', ')}`);

  // Phase 4: pin display order (supermarkets first). Idempotent by-title updates.
  let pins = 0;
  for (const [title, order] of Object.entries(PINNED_ORDERS)) {
    const row = await prisma.partner.findFirst({ where: { title }, select: { id: true, order: true } });
    const pending = !row && toInsert.some((p) => p.title === title); // dry-run: not inserted yet
    if (row ? row.order !== order : pending) {
      pins++;
      console.log(`  pin: ${title} -> order ${order}`);
      if (apply && row) await prisma.partner.update({ where: { id: row.id }, data: { order } });
    }
  }
  console.log(`order pins: ${pins}`);

  if (!apply) console.log('\nDry run - nothing written. Pass --apply to write.');
}

main()
  .catch((err) => {
    console.error('add-partners failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
