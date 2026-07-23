/**
 * Pure helpers for the one-time partner-cashback CSV import: percent
 * extraction from Hebrew benefit descriptions and partner-name
 * normalization for fuzzy title matching. No I/O here - unit-testable.
 */

/**
 * Extracts the FIRST percentage number from a CSV benefit cell.
 * Input: cell text like "60% הנחה" / "עד 15% הנחה" / "4.5% הנחה".
 * Output: the number (fractional preserved) or null when no percent exists.
 */
export function parseCashbackPct(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Normalizes a partner name for matching between the CSV (Hebrew names,
 * stray whitespace, apostrophes, geresh/gershayim) and DB titles/searchTerms.
 * Input: raw name. Output: lowercase, punctuation-stripped, single-spaced key.
 */
export function normalizePartnerName(name: string): string {
  return name
    .toLowerCase()
    // strip apostrophe-like marks (geresh, gershayim, curly + straight quotes)
    .replace(/['’‘"״׳`]/g, '')
    // strip Hebrew niqqud
    .replace(/[֑-ׇ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
