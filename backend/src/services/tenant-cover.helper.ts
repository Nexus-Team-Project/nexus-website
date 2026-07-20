/**
 * Request-assembly helper for the tenant cover routes (self + admin): parses
 * and validates the reconcile wire contract, re-hosts URL sources via
 * Cloudinary fetch-by-URL, uploads new files, and returns the FINAL ordered
 * entry list for tenant-cover.service.
 *
 * Wire contract (multipart form):
 *   covers[]      - new image files (order preserved)
 *   newFileCrops  - JSON (crop|null)[] aligned to covers[] order
 *   remoteImages  - JSON {url, crop|null}[] - http(s)-only, re-hosted here
 *   keptImages    - JSON {url, crop|null}[] - already-hosted entries (crop/
 *                   order edits ride these); URLs MUST be our Cloudinary URLs
 * Final stored order: keptImages, then covers[] files, then remoteImages.
 *
 * SECURITY: remote URLs are validated http(s)-only + length-capped and fetched
 * by CLOUDINARY (never this server); kept URLs are refused unless they are
 * Cloudinary-hosted, so no user-controlled origin can ever be persisted.
 */
import { z } from 'zod';
import {
  logoCropSchema,
  TENANT_COVER_IMAGES_MAX,
  type TenantCoverImage,
} from '../models/domain/tenant.models';
import {
  isUploadableImageUrl,
  MAX_IMAGE_URL_LENGTH,
  uploadTenantCover,
  uploadTenantCoverFromUrl,
} from '../utils/cloudinary';
import { pickDominantColors } from '../utils/dominant-color';

/** A kept (already-hosted) entry: must point at OUR Cloudinary account. */
const keptImageSchema = z.object({
  url: z.string().max(MAX_IMAGE_URL_LENGTH).refine(
    (value) => value.includes('res.cloudinary.com'),
    'kept cover images must be Cloudinary-hosted',
  ),
  crop: logoCropSchema.nullable(),
});

/** A remote-source entry: http(s)-only; re-hosted before storage. */
const remoteImageSchema = z.object({
  url: z.string().max(MAX_IMAGE_URL_LENGTH).refine(
    (value) => isUploadableImageUrl(value),
    'remote image URLs must be http(s)',
  ),
  crop: logoCropSchema.nullable(),
});

/** Crops aligned to the uploaded files (null = full image). */
const newFileCropsSchema = z.array(logoCropSchema.nullable());

/** Parse a JSON multipart field ('' / absent -> fallback), 400 on bad JSON. */
function parseJsonField(raw: unknown, field: string): unknown {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw Object.assign(new Error(`invalid_${field}`), { status: 400 });
  }
}

/**
 * Build the final ordered cover entries from a cover-save request.
 *
 * Input:  files - multer memory files from covers[]; body - the multipart body.
 * Output: the ordered {@link TenantCoverImage} list (uploads/re-hosts done).
 * Throws: { status: 400 } on validation failure or when the cap is exceeded.
 */
export async function buildCoverEntriesFromRequest(
  files: Express.Multer.File[],
  body: Record<string, unknown>,
): Promise<TenantCoverImage[]> {
  const keptParsed = z.array(keptImageSchema).safeParse(parseJsonField(body.keptImages, 'keptImages'));
  if (!keptParsed.success) throw Object.assign(new Error('invalid_keptImages'), { status: 400 });

  const remoteParsed = z.array(remoteImageSchema).safeParse(parseJsonField(body.remoteImages, 'remoteImages'));
  if (!remoteParsed.success) throw Object.assign(new Error('invalid_remoteImages'), { status: 400 });

  const cropsParsed = newFileCropsSchema.safeParse(parseJsonField(body.newFileCrops, 'newFileCrops'));
  if (!cropsParsed.success) throw Object.assign(new Error('invalid_newFileCrops'), { status: 400 });

  const total = keptParsed.data.length + files.length + remoteParsed.data.length;
  if (total > TENANT_COVER_IMAGES_MAX) {
    throw Object.assign(new Error('too_many_cover_images'), { status: 400 });
  }

  // Upload new files (order preserved), pairing each with its aligned crop.
  // Cover uploads carry Cloudinary's dominant-color analysis; the picked hexes
  // are stored on the entry (wallet store-tile fade). Empty pick = no field.
  const fileEntries: TenantCoverImage[] = [];
  for (const [index, file] of files.entries()) {
    const { url, palette } = await uploadTenantCover(file.buffer, file.originalname);
    const colors = pickDominantColors(palette);
    fileEntries.push({ url, crop: cropsParsed.data[index] ?? null, ...(colors.length ? { colors } : {}) });
  }

  // Re-host each remote source via Cloudinary fetch-by-URL (never our server).
  const remoteEntries: TenantCoverImage[] = [];
  for (const remote of remoteParsed.data) {
    const { url, palette } = await uploadTenantCoverFromUrl(remote.url);
    const colors = pickDominantColors(palette);
    remoteEntries.push({ url, crop: remote.crop, ...(colors.length ? { colors } : {}) });
  }

  return [...keptParsed.data, ...fileEntries, ...remoteEntries];
}
