/**
 * Backend-only Cloudinary background removal for tenant logos.
 *
 * Cloudinary's built-in `e_background_removal` transformation (the old AI
 * Background Removal add-on is deprecated - no add-on subscription needed)
 * processes asynchronously: the derived-image URL returns HTTP 423 until the
 * removal completes, then the result is cached. This module requests that
 * derived version of an already-uploaded logo, polls until it is ready,
 * downloads the transparent PNG, and re-uploads it as a NORMAL asset in the
 * tenant-logos folder - so the stored `Tenant.logoUrl` is a plain image that
 * renders transparent everywhere (including surfaces that show the raw URL
 * with no transform, e.g. the wallet header).
 *
 * Only public delivery URLs are fetched here; no API credentials are handled
 * (the re-upload goes through the existing signed `uploadTenantLogo`).
 */

import { env } from '../config/env.js';
import { uploadTenantLogo } from './cloudinary.js';

/** Max GET attempts while Cloudinary reports 423 (processing). */
const MAX_POLL_ATTEMPTS = 20;

/** Delay between polling attempts, in milliseconds (~40s total worst case). */
const POLL_DELAY_MS = 2000;

/** Awaitable sleep used between polling attempts. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the `e_background_removal` derived-image URL for a Cloudinary
 * delivery URL by inserting the transformation right after `/upload/`, with a
 * chained `f_png` component so the delivered format keeps the transparency.
 *
 * Input:  logoUrl - a Cloudinary secure delivery URL (`.../upload/v123/id.jpg`).
 * Output: the transformed URL, or null when the URL is not a Cloudinary
 *         `/upload/` delivery URL.
 */
function buildBackgroundRemovalUrl(logoUrl: string): string | null {
  if (!logoUrl.includes('res.cloudinary.com')) return null;
  const marker = '/upload/';
  const idx = logoUrl.indexOf(marker);
  if (idx === -1) return null;
  const head = logoUrl.slice(0, idx + marker.length);
  const tail = logoUrl.slice(idx + marker.length);
  return `${head}e_background_removal/f_png/${tail}`;
}

/**
 * Derives a readable re-upload filename from the original delivery URL so the
 * new public_id stays recognizable (e.g. `1710000000-acme_logo-nobg`).
 *
 * Input:  logoUrl - the original Cloudinary URL.
 * Output: `<original-basename>-nobg.png` (basename falls back to 'logo').
 */
function backgroundRemovedFilename(logoUrl: string): string {
  const lastSegment = logoUrl.split('/').pop() ?? '';
  const base = lastSegment.replace(/\.[^/.]+$/, '') || 'logo';
  return `${base}-nobg.png`;
}

/**
 * Removes the background of an already-uploaded tenant logo and stores the
 * result as a new permanent Cloudinary asset.
 *
 * Flow: build the `e_background_removal/f_png` derived URL -> GET it, retrying
 * on HTTP 423 while Cloudinary processes (capped) -> download the transparent
 * PNG bytes -> re-upload them via `uploadTenantLogo` -> return the new URL.
 *
 * NEVER throws: any failure (non-Cloudinary URL, Cloudinary unavailable,
 * processing timeout, transformation error, re-upload failure) logs a warning
 * and resolves to null so the caller keeps the original logo - a background
 * removal hiccup must never fail a logo upload.
 *
 * Input:  logoUrl - secure Cloudinary URL of the freshly uploaded original.
 * Output: Promise resolving to the new background-removed asset URL, or null
 *         when removal was skipped or failed (caller falls back to logoUrl).
 */
export async function removeLogoBackground(logoUrl: string): Promise<string | null> {
  if (!env.CLOUDINARY_URL) return null;
  const derivedUrl = buildBackgroundRemovalUrl(logoUrl);
  if (!derivedUrl) return null;

  try {
    let bytes: ArrayBuffer | null = null;
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      const res = await fetch(derivedUrl);
      if (res.ok) {
        bytes = await res.arrayBuffer();
        break;
      }
      if (res.status !== 423) {
        // Real failure (bad transform, unsupported image, quota) - do not retry.
        console.warn(
          `[logo-background] background removal failed (HTTP ${res.status}) for ${logoUrl} - keeping original`,
        );
        return null;
      }
      // 423 = still processing; wait and poll again.
      if (attempt < MAX_POLL_ATTEMPTS) await sleep(POLL_DELAY_MS);
    }

    if (!bytes) {
      console.warn(
        `[logo-background] background removal timed out after ${MAX_POLL_ATTEMPTS} polls for ${logoUrl} - keeping original`,
      );
      return null;
    }

    return await uploadTenantLogo(Buffer.from(bytes), backgroundRemovedFilename(logoUrl));
  } catch (err) {
    console.warn(`[logo-background] background removal errored for ${logoUrl} - keeping original`, err);
    return null;
  }
}
