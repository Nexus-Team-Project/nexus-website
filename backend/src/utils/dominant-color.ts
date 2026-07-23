/**
 * Pure selection of display-worthy dominant colors from a Cloudinary color
 * palette (`[hex, percentage][]`, most common first).
 *
 * Near-white and near-black entries are dropped before picking: product/logo
 * photos are typically dominated by a white (or black) background, and a
 * white "dominant color" would make the wallet store-tile fade invisible.
 * The same guard existed in the legacy wallet's canvas sampler. If EVERY
 * entry is filtered out (a genuinely monochrome image), the top unfiltered
 * color is returned so callers always get something usable when a palette
 * exists at all.
 */
import type { CloudinaryPalette } from './cloudinary';

/** Luma above this (0..255) counts as near-white background. */
const NEAR_WHITE_LUMA = 242;
/** Luma below this (0..255) counts as near-black background. */
const NEAR_BLACK_LUMA = 12;
/** How many hexes to keep (index 0 = the fade color; the rest are spares). */
const MAX_COLORS = 3;

/** Normalizes a palette hex to lowercase '#rrggbb'; null when malformed. */
function normalizeHex(value: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

/** Rec. 601 luma (0..255) of a normalized '#rrggbb' hex. */
function luma(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Picks up to MAX_COLORS display-worthy hexes from a Cloudinary palette.
 *
 * Input:  palette - Cloudinary `colors` upload/Admin-API field (may be
 *         null/undefined/empty when analysis was unavailable).
 * Output: lowercase '#rrggbb' hexes, most common first; empty array when the
 *         palette holds no parseable color (callers then store no colors).
 */
export function pickDominantColors(palette: CloudinaryPalette | null | undefined): string[] {
  if (!palette || palette.length === 0) return [];

  const normalized: string[] = [];
  for (const entry of palette) {
    const hex = typeof entry?.[0] === 'string' ? normalizeHex(entry[0]) : null;
    if (hex) normalized.push(hex);
  }
  if (normalized.length === 0) return [];

  const usable = normalized.filter((hex) => {
    const l = luma(hex);
    return l >= NEAR_BLACK_LUMA && l <= NEAR_WHITE_LUMA;
  });

  // Monochrome image (all filtered): fall back to the top raw color so a
  // palette never resolves to nothing.
  const picked = usable.length > 0 ? usable : [normalized[0]];
  return picked.slice(0, MAX_COLORS);
}
