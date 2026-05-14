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

/** Shape of a successful Cloudinary upload API response (partial). */
interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

/** Parsed credentials extracted from CLOUDINARY_URL. */
interface CloudinaryCredentials {
  apiKey: string;
  apiSecret: string;
  cloudName: string;
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
  if (!env.CLOUDINARY_URL) {
    throw new Error('CLOUDINARY_URL is not configured - offer image upload is unavailable');
  }

  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(env.CLOUDINARY_URL);

  const folder = 'nexus/offers';
  const publicId = `${folder}/${Date.now()}-${sanitizeFilename(filename)}`;
  const timestamp = String(Math.round(Date.now() / 1000));

  // Parameters that are included in the signature (alphabetical order matters
  // only for the signature string; the form fields themselves can be in any order).
  const signedParams: Record<string, string> = {
    folder,
    public_id: publicId,
    timestamp,
  };

  const signature = buildSignature(signedParams, apiSecret);

  const form = new FormData();
  form.append('file', new Blob([buffer]));
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp);
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const res = await fetch(uploadUrl, { method: 'POST', body: form });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary upload failed (HTTP ${res.status}): ${body}`);
  }

  const data = (await res.json()) as CloudinaryUploadResult;
  return data.secure_url;
}

/**
 * Returns a static default placeholder image URL for offers that have no
 * uploaded image.
 *
 * Input:  none.
 * Output: absolute HTTPS URL string pointing to the default offer image.
 */
export function defaultOfferImageUrl(): string {
  return 'https://res.cloudinary.com/nexus/image/upload/v1/nexus/offers/default-offer.png';
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
