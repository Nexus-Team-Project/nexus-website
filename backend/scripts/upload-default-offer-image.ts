/**
 * One-shot script: upload the default offer placeholder image to Cloudinary
 * under a FIXED public_id so the delivery URL is stable and the upload can be
 * re-run (overwrite) without changing the URL.
 *
 * Why a fixed public_id: the offer "no image" placeholder URL is hardcoded in
 * both the backend (`defaultOfferImageUrl()`) and the dashboard offer form.
 * A timestamped public_id would change the URL on every run; a fixed one keeps
 * the same URL forever, so re-running this only refreshes the bytes.
 *
 * Usage (from nexus-website/backend):
 *   npx tsx scripts/upload-default-offer-image.ts <path-to-image>
 *
 * Output: prints the resulting secure HTTPS Cloudinary URL to stdout.
 *
 * Security: reads CLOUDINARY_URL from the backend .env; never logs the secret.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Fixed Cloudinary public_id for the default offer placeholder. */
const PUBLIC_ID = 'nexus/defaults/offer-placeholder';

/**
 * Parses CLOUDINARY_URL (`cloudinary://key:secret@cloud`) into parts.
 * Input: the env string. Output: { apiKey, apiSecret, cloudName }.
 */
function parseCloudinaryUrl(url: string): { apiKey: string; apiSecret: string; cloudName: string } {
  const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!match) throw new Error('CLOUDINARY_URL must be cloudinary://api_key:api_secret@cloud_name');
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
}

/**
 * Builds the Cloudinary SHA-1 signature: signed params sorted alphabetically,
 * joined as `k=v&...`, then the api secret appended with no separator.
 */
function buildSignature(params: Record<string, string>, apiSecret: string): string {
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(`${paramString}${apiSecret}`).digest('hex');
}

/** Reads the image, signs an overwriting upload at the fixed public_id, prints the URL. */
async function main(): Promise<void> {
  const imagePath = process.argv[2];
  if (!imagePath) throw new Error('Usage: npx tsx scripts/upload-default-offer-image.ts <path-to-image>');

  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) throw new Error('CLOUDINARY_URL is not set in the environment');

  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(cloudinaryUrl);
  const buffer = await readFile(imagePath);
  const timestamp = String(Math.round(Date.now() / 1000));

  // overwrite=true so re-runs replace the same asset instead of erroring.
  const signedParams: Record<string, string> = {
    overwrite: 'true',
    public_id: PUBLIC_ID,
    timestamp,
  };
  const signature = buildSignature(signedParams, apiSecret);

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]));
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp);
  form.append('signature', signature);
  form.append('public_id', PUBLIC_ID);
  form.append('overwrite', 'true');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary upload failed (HTTP ${res.status}): ${await res.text()}`);

  const data = (await res.json()) as { secure_url: string };
  console.log(data.secure_url);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
