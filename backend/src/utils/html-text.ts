/**
 * HTML -> plain text for server-side indexing/search.
 *
 * Offer descriptions are TipTap-generated rich HTML. Search must match only the
 * VISIBLE text, never tag names, attributes, or inline styles, so a plain-text
 * mirror is stamped onto the document at write time (NexusOffer.descriptionText)
 * and every search engine (Atlas Search + regex fallback) reads that field.
 *
 * Node has no DOMParser; this is a small, dependency-free stripper that is safe
 * for generated (well-formed) markup: script/style bodies dropped, tags replaced
 * with spaces (so "<p>a</p><p>b</p>" -> "a b", never "ab"), common + numeric
 * entities decoded, whitespace collapsed. The output is NEVER re-rendered as
 * HTML anywhere - it exists purely for matching - so no sanitization is needed.
 */

/** Named entities TipTap/browsers commonly emit. */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Strips HTML to the visible plain text.
 * Input:  html string (may be empty/plain text already).
 * Output: single-line plain text, entities decoded, whitespace collapsed.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  const withoutBlocks = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, ' ');
  const decoded = withoutTags
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
  return decoded.replace(/\s+/g, ' ').trim();
}
