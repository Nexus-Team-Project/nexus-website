/**
 * One-time import of partner cashback percentages from the management CSV
 * (workspace root, Hebrew). Dry-run by default; --apply writes.
 *
 * Usage (from nexus-website/backend):
 *   npx tsx scripts/import-partner-cashback.ts [--apply] [--csv="C:\\Nexus\\<file>.csv"]
 *
 * Row handling:
 *   - CSV columns: name, מהות (benefit text), הערות, סטטוס, (trailing empty).
 *   - Category header rows / blank rows / the date header are skipped
 *     (detected: empty benefit cell).
 *   - Rows whose benefit cell has NO percentage are SKIPPED by design
 *     (partner simply gets no cashback) - reported, never an error.
 *   - Matching: normalized CSV name -> CASHBACK_NAME_OVERRIDES first, then
 *     normalized Partner.title, then normalized searchTerms entries.
 *   - Unmatched rows are reported for a later manual decision; they never
 *     block the run.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { parseCashbackPct, normalizePartnerName } from './import-partner-cashback/parse';
import { CASHBACK_NAME_OVERRIDES } from './import-partner-cashback/mapping.data';

const DEFAULT_CSV = path.resolve(
  __dirname,
  '../../..',
  'עותק של הטבות במערכת ובתהליך - 13.7.26 - גיליון1.csv',
);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const csvArg = process.argv.find((a) => a.startsWith('--csv='));
  const csvPath = csvArg ? csvArg.slice('--csv='.length) : DEFAULT_CSV;

  // BOM-safe read; the file is comma-separated with no quoted commas.
  const raw = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const rows = raw.split(/\r?\n/).map((line) => line.split(',').map((c) => c.trim()));

  const partners = await prisma.partner.findMany({
    select: { id: true, title: true, searchTerms: true },
  });
  const byKey = new Map<string, { id: string; title: string }>();
  for (const p of partners) {
    byKey.set(normalizePartnerName(p.title), { id: p.id, title: p.title });
    for (const term of p.searchTerms) {
      const key = normalizePartnerName(term);
      if (!byKey.has(key)) byKey.set(key, { id: p.id, title: p.title });
    }
  }

  const updates: { id: string; title: string; csvName: string; pct: number }[] = [];
  const skippedNoPercent: string[] = [];
  const unmatched: string[] = [];

  for (const cells of rows) {
    const [name, benefit] = cells;
    if (!name || !benefit) continue; // header/category/blank rows
    const pct = parseCashbackPct(benefit);
    if (pct === null) {
      skippedNoPercent.push(`${name} | ${benefit}`);
      continue;
    }
    const key = normalizePartnerName(name);
    const overrideTitle = CASHBACK_NAME_OVERRIDES[key];
    const match = overrideTitle
      ? byKey.get(normalizePartnerName(overrideTitle))
      : byKey.get(key);
    if (!match) {
      unmatched.push(`${name} -> ${pct}%`);
      continue;
    }
    updates.push({ id: match.id, title: match.title, csvName: name, pct });
  }

  console.log(`\nCSV: ${csvPath}`);
  console.log(`Matched: ${updates.length} | skipped (no %): ${skippedNoPercent.length} | unmatched: ${unmatched.length}\n`);
  for (const u of updates) console.log(`  SET  ${u.title}  cashbackPct=${u.pct}  (csv: ${u.csvName})`);
  if (skippedNoPercent.length) {
    console.log('\nSkipped - no percentage in benefit cell (by design):');
    for (const s of skippedNoPercent) console.log(`  - ${s}`);
  }
  if (unmatched.length) {
    console.log('\nUNMATCHED rows (add to CASHBACK_NAME_OVERRIDES or decide later):');
    for (const u of unmatched) console.log(`  - ${u}`);
  }

  if (!apply) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to write.');
    return;
  }
  for (const u of updates) {
    await prisma.partner.update({ where: { id: u.id }, data: { cashbackPct: u.pct } });
  }
  console.log(`\nApplied ${updates.length} updates.`);
}

main()
  .catch((err) => {
    console.error('[import-partner-cashback] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
