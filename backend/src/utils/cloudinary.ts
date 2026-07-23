/**
 * Backend-only Cloudinary upload utility for offer images.
 *
 * Uses the Cloudinary REST upload API with signed requests so no SDK
 * dependency is needed. All uploads land in the `nexus/offers` folder.
 *
 * CLOUDINARY_URL format: cloudinary://api_key:api_secret@cloud_name
 *
 * Security: this module must never be imported by frontend code.
 * The CLOUDINARY_URL env var must never be exposed to the browser.
 */

import { createHash } from 'node:crypto';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dominant-color palette as returned by Cloudinary when `colors` analysis is
 * requested: `[hex, percentage]` pairs sorted by share (most common first).
 */
export type CloudinaryPalette = [string, number][];

/** Shape of a successful Cloudinary upload API response (partial). */
interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  /** Present only when the upload requested `colors: true`. */
  colors?: CloudinaryPalette;
}

/** Parsed credentials extracted from CLOUDINARY_URL. */
export interface CloudinaryCredentials {
  apiKey: string;
  apiSecret: string;
  cloudName: string;
}

/**
 * Returns the environment's parsed Cloudinary credentials, or null when
 * CLOUDINARY_URL is unset. For BACKEND-ONLY consumers that must call a
 * Cloudinary endpoint this module does not wrap (e.g. the cover-colors
 * backfill script's Admin API reads). Never expose any of it to a client.
 */
export function getCloudinaryCredentials(): CloudinaryCredentials | null {
  return env.CLOUDINARY_URL ? parseCloudinaryUrl(env.CLOUDINARY_URL) : null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses CLOUDINARY_URL into individual Cloudinary credentials.
 *
 * Input:  url - string in `cloudinary://key:secret@cloud_name` format.
 * Output: CloudinaryCredentials object.
 * Throws: Error if the URL format is invalid.
 */
function parseCloudinaryUrl(url: string): CloudinaryCredentials {
  const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!match) {
    throw new Error('CLOUDINARY_URL must be in format: cloudinary://api_key:api_secret@cloud_name');
  }
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
}

/**
 * Produces a safe public_id segment from an original filename.
 * Strips the file extension and replaces characters outside [a-zA-Z0-9_-]
 * with underscores so the resulting ID is URL-safe.
 *
 * Input:  filename - original file name (may include extension).
 * Output: sanitized slug string.
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')           // strip extension
    .replace(/[^a-zA-Z0-9_-]/g, '_');  // replace unsafe chars
}

/**
 * Computes the SHA-1 HMAC signature required by the Cloudinary signed
 * upload endpoint.
 *
 * The signature covers the upload parameters concatenated in alphabetical
 * order followed by the API secret (no separator before the secret).
 * See: https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
 *
 * Input:
 *   params    - key/value pairs that will be signed (must NOT include api_key or file).
 *   apiSecret - Cloudinary API secret for the account.
 * Output: lowercase hex SHA-1 digest string.
 */
function buildSignature(params: Record<string, string>, apiSecret: string): string {
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(`${paramString}${apiSecret}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Shared signed-upload implementation for image buffers. Every buffer upload
 * (offer image, tenant logo, tenant cover) is the same signed REST request
 * differing only by target folder and error label.
 *
 * Input:
 *   buffer  - raw image data.
 *   filename - original file name used to derive a readable public_id.
 *   folder  - Cloudinary folder (e.g. 'nexus/offers').
 *   label   - human label for the unavailable/failure error messages.
 *   requestColors - when true, asks Cloudinary to also analyze the image's
 *                   dominant colors (returned on the result's `colors`).
 * Output: Promise resolving to the (partial) Cloudinary upload response.
 * Throws: if CLOUDINARY_URL is unset or Cloudinary returns a non-2xx.
 */
async function uploadImageBuffer(
  buffer: Buffer,
  filename: string,
  folder: string,
  label: string,
  requestColors = false,
): Promise<CloudinaryUploadResult> {
  if (!env.CLOUDINARY_URL) {
    throw new Error(`CLOUDINARY_URL is not configured - ${label} upload is unavailable`);
  }

  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(env.CLOUDINARY_URL);

  const publicId = `${folder}/${Date.now()}-${sanitizeFilename(filename)}`;
  const timestamp = String(Math.round(Date.now() / 1000));

  // Parameters that are included in the signature (alphabetical order matters
  // only for the signature string; the form fields themselves can be in any
  // order). The `colors` analysis flag is a signed param like any other.
  const signedParams: Record<string, string> = {
    folder,
    public_id: publicId,
    timestamp,
    ...(requestColors ? { colors: 'true' } : {}),
  };

  const signature = buildSignature(signedParams, apiSecret);

  const form = new FormData();
  form.append('file', new Blob([buffer]));
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp);
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);
  if (requestColors) form.append('colors', 'true');

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const res = await fetch(uploadUrl, { method: 'POST', body: form });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary ${label} upload failed (HTTP ${res.status}): ${body}`);
  }

  return (await res.json()) as CloudinaryUploadResult;
}

/**
 * Uploads an image buffer to Cloudinary under the `nexus/offers` folder
 * using a signed REST request (no SDK required).
 *
 * Input:
 *   buffer   - raw image data.
 *   filename - original file name used to derive a readable public_id.
 * Output: Promise resolving to the secure HTTPS URL of the stored image.
 * Throws:
 *   - If CLOUDINARY_URL is not set in env.
 *   - If the Cloudinary API returns a non-2xx response.
 */
export async function uploadOfferImage(buffer: Buffer, filename: string): Promise<string> {
  return (await uploadImageBuffer(buffer, filename, 'nexus/offers', 'offer image')).secure_url;
}

/**
 * Hard cap on accepted remote-image URL length (abuse guard - a legitimate
 * image URL never approaches this). Mirrored by the route-level Zod schemas.
 */
export const MAX_IMAGE_URL_LENGTH = 2048;

/**
 * Cheap pre-check before asking Cloudinary to fetch a remote image: the value
 * must be a non-empty http(s) URL string within the length cap. This does NOT
 * verify the URL points at a real image — Cloudinary's fetch decides that;
 * callers fall back when the upload throws. Blocks free text and non-http
 * schemes (javascript:, data:, file:, blob:) so a dangerous scheme can never
 * reach a fetch or a stored field.
 *
 * Input:  any value (typically a CSV cell or a route body field).
 * Output: true only for an http(s) URL string within MAX_IMAGE_URL_LENGTH.
 */
export function isUploadableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length <= MAX_IMAGE_URL_LENGTH && /^https?:\/\/\S+$/i.test(trimmed);
}

/**
 * Uploads an image to Cloudinary BY URL (Cloudinary downloads the remote file,
 * stores it in our account, and returns a permanent secure_url) so the asset is
 * owned/managed by us rather than the supplier's link. Same signed REST request
 * as `uploadOfferImage`, but the `file` field is the remote URL string instead
 * of a Blob.
 *
 * SECURITY: the remote fetch is performed by CLOUDINARY's infrastructure, never
 * by this server - no outbound request to the user's URL leaves our backend,
 * so internal hosts/metadata endpoints are unreachable by construction. The
 * scheme/length check here is defense-in-depth, not the SSRF boundary.
 *
 * Input:  remoteUrl - a public http(s) image URL.
 *         folder    - target Cloudinary folder (default 'nexus/offers'; tenant
 *                     logo/cover callers pass their own folders).
 * Output: Promise resolving to the secure HTTPS Cloudinary URL.
 * Throws:
 *   - If remoteUrl is not a valid http(s) URL (caller should fall back).
 *   - If CLOUDINARY_URL is not configured.
 *   - If Cloudinary returns a non-2xx (e.g. the URL is unreachable / not an image).
 */
export async function uploadOfferImageFromUrl(
  remoteUrl: string,
  folder = 'nexus/offers',
): Promise<string> {
  return (await uploadFromUrlCore(remoteUrl, folder, false)).secure_url;
}

/**
 * Re-hosts a remote image as a TENANT COVER (`nexus/tenant-covers`) and also
 * returns Cloudinary's dominant-color palette (same analysis as the buffer
 * cover upload) so URL-sourced covers get fade colors too.
 *
 * Input:  remoteUrl - a public http(s) image URL.
 * Output: Promise resolving to { url, palette } (palette null when absent).
 * Throws: same conditions as {@link uploadOfferImageFromUrl}.
 */
export async function uploadTenantCoverFromUrl(
  remoteUrl: string,
): Promise<{ url: string; palette: CloudinaryPalette | null }> {
  const data = await uploadFromUrlCore(remoteUrl, TENANT_COVER_FOLDER, true);
  return { url: data.secure_url, palette: data.colors ?? null };
}

/**
 * Shared signed upload-BY-URL request (see {@link uploadOfferImageFromUrl} for
 * the security notes). `requestColors` adds the signed `colors` analysis flag.
 */
async function uploadFromUrlCore(
  remoteUrl: string,
  folder: string,
  requestColors: boolean,
): Promise<CloudinaryUploadResult> {
  if (!isUploadableImageUrl(remoteUrl)) {
    throw new Error('uploadOfferImageFromUrl requires an http(s) URL');
  }
  if (!env.CLOUDINARY_URL) {
    throw new Error('CLOUDINARY_URL is not configured - offer image upload is unavailable');
  }

  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(env.CLOUDINARY_URL);

  const publicId = `${folder}/${Date.now()}-url`;
  const timestamp = String(Math.round(Date.now() / 1000));

  const signedParams: Record<string, string> = {
    folder,
    public_id: publicId,
    timestamp,
    ...(requestColors ? { colors: 'true' } : {}),
  };
  const signature = buildSignature(signedParams, apiSecret);

  const form = new FormData();
  // The remote URL goes in the `file` field; Cloudinary fetches it server-side.
  form.append('file', remoteUrl.trim());
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp);
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);
  if (requestColors) form.append('colors', 'true');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary upload-from-URL failed (HTTP ${res.status}): ${body}`);
  }

  return (await res.json()) as CloudinaryUploadResult;
}

/**
 * Uploads a tenant (organization) logo to Cloudinary under the
 * `nexus/tenant-logos` folder using a signed REST request. A fresh unique
 * public_id is used each time; callers delete the previous logo via
 * deleteOfferImage (it works for any Cloudinary URL) so there are no orphans.
 *
 * Input:  buffer - raw (already square-cropped) image data; filename - original
 *         name used to derive a readable public_id.
 * Output: Promise resolving to the secure HTTPS URL.
 * Throws: if CLOUDINARY_URL is unset or Cloudinary returns a non-2xx.
 */
export async function uploadTenantLogo(buffer: Buffer, filename: string): Promise<string> {
  return (await uploadImageBuffer(buffer, filename, TENANT_LOGO_FOLDER, 'tenant logo')).secure_url;
}

/** Cloudinary folders for tenant branding assets (also used by URL re-hosts). */
export const TENANT_LOGO_FOLDER = 'nexus/tenant-logos';
export const TENANT_COVER_FOLDER = 'nexus/tenant-covers';

/**
 * Uploads a tenant cover image to Cloudinary under `nexus/tenant-covers`.
 * Same pristine-original semantics as the logo: callers delete replaced assets
 * via deleteOfferImage so there are no orphans. Cover uploads always request
 * the dominant-color analysis (free - part of the upload response) so the
 * wallet store tiles can tint their bottom fade with the image's own color.
 *
 * Input:  buffer - raw image data; filename - original name for the public_id.
 * Output: Promise resolving to { url, palette } (palette null when Cloudinary
 *         returned no color data - callers store no colors in that case).
 * Throws: if CLOUDINARY_URL is unset or Cloudinary returns a non-2xx.
 */
export async function uploadTenantCover(
  buffer: Buffer,
  filename: string,
): Promise<{ url: string; palette: CloudinaryPalette | null }> {
  const data = await uploadImageBuffer(buffer, filename, TENANT_COVER_FOLDER, 'tenant cover', true);
  return { url: data.secure_url, palette: data.colors ?? null };
}

/**
 * Fixed Cloudinary public_id of the default offer placeholder. The asset is
 * uploaded to each environment's Cloudinary account at this same id via
 * scripts/upload-default-offer-image.ts, so the delivery URL only differs by
 * cloud name between dev and prod.
 */
const DEFAULT_OFFER_IMAGE_PUBLIC_ID = 'nexus/defaults/offer-placeholder';

/** Dev-account cloud name, used only as a fallback when CLOUDINARY_URL is unset. */
const FALLBACK_CLOUD_NAME = 'dyqjvjdlq';

/**
 * Returns the default placeholder image URL for offers that have no uploaded
 * image. The cloud name is derived from the environment's CLOUDINARY_URL, so
 * dev serves the dev account's copy and prod serves the prod account's copy
 * with no hardcoded environment URL. Only the cloud name (which is public,
 * appearing in every delivery URL) is read - never the api key or secret.
 * Version-less so re-uploading the asset swaps the image with no code change.
 *
 * Input:  none.
 * Output: absolute HTTPS Cloudinary URL string pointing to the default image.
 */
export function defaultOfferImageUrl(): string {
  const cloudName = env.CLOUDINARY_URL
    ? parseCloudinaryUrl(env.CLOUDINARY_URL).cloudName
    : FALLBACK_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloudName}/image/upload/${DEFAULT_OFFER_IMAGE_PUBLIC_ID}.png`;
}

/**
 * Deletes an offer image from Cloudinary by its secure URL.
 *
 * Extracts the public_id from the URL and calls the Cloudinary signed destroy
 * API. Errors are intentionally swallowed - offer deletion must succeed even
 * when Cloudinary is unavailable or the image has already been removed.
 *
 * Input:  imageUrl - secure_url returned by Cloudinary at upload time.
 * Output: Promise<void>. Never rejects.
 */
export async function deleteOfferImage(imageUrl: string): Promise<void> {
  // Skip when Cloudinary is not configured or the URL is not a Cloudinary URL.
  if (!env.CLOUDINARY_URL) return;
  if (!imageUrl.includes('res.cloudinary.com')) return;

  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(env.CLOUDINARY_URL);

  // Extract public_id: everything between /upload/(v{version}/)? and the extension.
  // Example: https://res.cloudinary.com/cloud/image/upload/v123/nexus/offers/foo.jpg
  //          -> public_id = nexus/offers/foo
  const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  if (!match) return;

  const publicId = match[1];
  // NEVER delete the shared default placeholder: many offers reference it as their
  // cover (no uploaded image), so deleting one such offer - or a user - must not
  // remove the asset others still rely on. It lives outside nexus/offers and is
  // uploaded once per environment, so it is safe to keep forever.
  if (publicId === DEFAULT_OFFER_IMAGE_PUBLIC_ID) return;

  const timestamp = Math.round(Date.now() / 1000);

  // Cloudinary signed destroy requires: public_id + timestamp + api_secret concatenated.
  const signatureBase = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash('sha1').update(signatureBase).digest('hex');

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);

  try {
    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: form,
    });
  } catch {
    // Swallow - offer deletion must succeed even if Cloudinary is unreachable.
  }
}
