/**
 * Backfill: extract dominant colors for tenant cover images stored BEFORE the
 * 2026-07-20 upload-time color capture, via the Cloudinary Admin API
 * (`GET /resources/image/upload/:public_id?colors=true`, basic auth). Each
 * entry's picked hexes (utils/dominant-color) are $set onto the tenant's
 * coverImages array; entries that already have colors are skipped, so
 * re-running is idempotent and only touches what is missing.
 *
 * The Admin API is rate-limited (500-2000 req/h by plan), so calls are
 * throttled; cover volume is tiny (max 5 per tenant).
 *
 * Dry-run by default; pass --apply to write.
 *   npx tsx scripts/backfill-cover-colors.ts [--apply]
 */
import 'dotenv/config';
import { closeMongoConnection, getMongoDb } from '../src/config/mongo';
import { getTenantDomainCollections } from '../src/models/domain';
import type { TenantCoverImage } from '../src/models/domain/tenant.models';
import { getCloudinaryCredentials, type CloudinaryPalette } from '../src/utils/cloudinary';
import { pickDominantColors } from '../src/utils/dominant-color';

const apply = process.argv.includes('--apply');

/** Gap between Admin API calls (~2 req/s, far under the hourly limit). */
const THROTTLE_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extracts the Cloudinary public_id from a delivery URL (same pattern as
 * deleteOfferImage): everything between /upload/(v{version}/)? and the
 * extension. Returns null for non-Cloudinary URLs.
 */
function publicIdFromUrl(url: string): string | null {
  if (!url.includes('res.cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  return match ? match[1] : null;
}

/**
 * Fetches an asset's color palette from the Admin API. Returns null on any
 * failure (missing asset, rate limit, network) - the entry is then reported
 * and skipped rather than failing the whole run.
 */
async function fetchPalette(
  creds: { apiKey: string; apiSecret: string; cloudName: string },
  publicId: string,
): Promise<CloudinaryPalette | null> {
  const url = `https://api.cloudinary.com/v1_1/${creds.cloudName}/resources/image/upload/${publicId}?colors=true`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64')}`,
      },
    });
    if (!res.ok) {
      console.warn(`  Admin API HTTP ${res.status} for ${publicId}`);
      return null;
    }
    const data = (await res.json()) as { colors?: CloudinaryPalette };
    return data.colors ?? null;
  } catch (err) {
    console.warn(`  Admin API request failed for ${publicId}:`, err);
    return null;
  }
}

async function main(): Promise<void> {
  const creds = getCloudinaryCredentials();
  if (!creds) {
    console.error('CLOUDINARY_URL is not configured - cannot query the Admin API.');
    process.exit(1);
  }

  const db = await getMongoDb();
  const { domainTenants } = getTenantDomainCollections(db);

  const tenants = await domainTenants
    .find({ 'coverImages.0': { $exists: true } })
    .project<{ tenantId: string; organizationName?: string; coverImages: TenantCoverImage[] }>({
      tenantId: 1,
      organizationName: 1,
      coverImages: 1,
    })
    .toArray();

  const pending = tenants.filter((t) => t.coverImages.some((entry) => !entry.colors?.length));
  console.log(
    `${tenants.length} tenants with covers; ${pending.length} need colors; ` +
      `${apply ? 'APPLYING' : 'DRY-RUN (pass --apply to write)'}`,
  );

  let updatedEntries = 0;
  let skippedEntries = 0;
  for (const tenant of pending) {
    const label = tenant.organizationName ?? tenant.tenantId;
    let changed = false;
    const entries: TenantCoverImage[] = [];
    for (const entry of tenant.coverImages) {
      if (entry.colors?.length) {
        entries.push(entry);
        continue;
      }
      const publicId = publicIdFromUrl(entry.url);
      if (!publicId) {
        console.warn(`  [${label}] non-Cloudinary cover URL skipped`);
        entries.push(entry);
        skippedEntries += 1;
        continue;
      }
      if (!apply) {
        console.log(`  [${label}] would fetch colors for ${publicId}`);
        entries.push(entry);
        continue;
      }
      const palette = await fetchPalette(creds, publicId);
      await sleep(THROTTLE_MS);
      const colors = pickDominantColors(palette);
      if (colors.length === 0) {
        console.warn(`  [${label}] no usable palette for ${publicId} - left without colors`);
        entries.push(entry);
        skippedEntries += 1;
        continue;
      }
      entries.push({ ...entry, colors });
      changed = true;
      updatedEntries += 1;
      console.log(`  [${label}] ${publicId} -> ${colors.join(', ')}`);
    }
    if (apply && changed) {
      await domainTenants.updateOne(
        { tenantId: tenant.tenantId },
        { $set: { coverImages: entries, updatedAt: new Date() } },
      );
    }
  }

  console.log(`Done. ${updatedEntries} entries updated, ${skippedEntries} skipped.`);
  await closeMongoConnection();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
