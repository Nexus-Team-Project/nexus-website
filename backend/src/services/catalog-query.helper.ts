/**
 * Catalog query helpers used by catalog.service.
 *
 * Extracted so the main service file stays inside the 350-line guideline.
 * Pure functions; no Mongo I/O here.
 */

/**
 * Builds a Mongo `$or` clause that matches the supplied search string against
 * an offer's title OR description using a case-insensitive `$regex`.
 *
 * Returns null when the input is empty/whitespace - callers should skip the
 * clause entirely in that case. Special regex characters are escaped so a
 * user typing "." or "(" does not crash the query or do anything surprising.
 *
 * Input:  raw - free-text search value from the request (may be undefined).
 * Output: a Mongo filter object suitable for `$and`/`$or` composition, or null.
 */
export function buildSearchFilter(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  // 200-char cap mirrors the Zod input cap and bounds regex compile cost.
  const trimmed = raw.trim().slice(0, 200);
  if (!trimmed) return null;
  // Mongo regex needs special-character escaping; mirrors the pattern used in
  // domain-member-read.service for member-list search to stay consistent.
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    $or: [
      { title: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ],
  };
}
