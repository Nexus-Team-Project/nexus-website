/**
 * Tenant cover-image gallery lifecycle (ordered, max TENANT_COVER_IMAGES_MAX).
 *
 * Reconcile model: the caller (route) assembles the FINAL desired entry list -
 * already-hosted kept entries (with possibly-updated crops/order), freshly
 * uploaded files, and re-hosted URL sources - and this service stores it and
 * best-effort deletes the Cloudinary assets of entries dropped from the set
 * (no orphans). Crop changes are metadata-only: a kept entry's URL never
 * re-uploads. Only OUR Cloudinary URLs are ever stored (URL sources are
 * re-hosted by the route BEFORE reaching this service).
 */
import { Db } from 'mongodb';
import { getTenantDomainCollections } from '../models/domain';
import {
  TENANT_COVER_IMAGES_MAX,
  type TenantCoverImage,
} from '../models/domain/tenant.models';
import { deleteOfferImage } from '../utils/cloudinary';

/**
 * Store the reconciled cover set for a tenant and clean up dropped assets.
 *
 * Input: tenantId + the final ordered entries (must already be hosted URLs).
 * Output: the stored entries.
 * Throws: { status: 400 } when the set exceeds the cap.
 */
export async function setTenantCovers(
  db: Db,
  args: { tenantId: string; entries: TenantCoverImage[] },
): Promise<{ coverImages: TenantCoverImage[] }> {
  if (args.entries.length > TENANT_COVER_IMAGES_MAX) {
    throw Object.assign(new Error('too_many_cover_images'), { status: 400 });
  }
  const { domainTenants } = getTenantDomainCollections(db);
  const existing = await domainTenants.findOne(
    { tenantId: args.tenantId },
    { projection: { coverImages: 1 } },
  );
  const previous = (existing?.coverImages ?? []) as TenantCoverImage[];

  // Kept entries arrive from the client with only url+crop (the wire contract
  // never carries colors), so re-attach each kept URL's stored dominant colors
  // here - otherwise every reconcile save would silently wipe them.
  const colorsByUrl = new Map(
    previous.filter((entry) => entry.colors?.length).map((entry) => [entry.url, entry.colors as string[]]),
  );
  const entries = args.entries.map((entry) => {
    if (entry.colors?.length) return entry;
    const stored = colorsByUrl.get(entry.url);
    return stored ? { ...entry, colors: stored } : entry;
  });

  await domainTenants.updateOne(
    { tenantId: args.tenantId },
    entries.length > 0
      ? { $set: { coverImages: entries, updatedAt: new Date() } }
      : { $unset: { coverImages: '' }, $set: { updatedAt: new Date() } },
  );

  // Best-effort: destroy Cloudinary assets no longer referenced by the set.
  const keptUrls = new Set(entries.map((entry) => entry.url));
  for (const entry of previous) {
    if (entry.url && !keptUrls.has(entry.url)) void deleteOfferImage(entry.url);
  }

  return { coverImages: entries };
}

/**
 * Clear the tenant's whole cover set + destroy every Cloudinary asset.
 *
 * Input: tenantId.
 * Output: void (the wallet falls back to its hero placeholder).
 */
export async function clearTenantCovers(db: Db, args: { tenantId: string }): Promise<void> {
  const { domainTenants } = getTenantDomainCollections(db);
  const existing = await domainTenants.findOne(
    { tenantId: args.tenantId },
    { projection: { coverImages: 1 } },
  );
  await domainTenants.updateOne(
    { tenantId: args.tenantId },
    { $unset: { coverImages: '' }, $set: { updatedAt: new Date() } },
  );
  for (const entry of (existing?.coverImages ?? []) as TenantCoverImage[]) {
    if (entry.url) void deleteOfferImage(entry.url);
  }
}
