/**
 * Tenant (organization) logo lifecycle. Uploads the square-cropped logo to
 * Cloudinary, stores the secure URL on the Tenant, and best-effort cleans up the
 * previous Cloudinary asset. Removing clears the URL (the UI falls back to the
 * tenant-name initials).
 */
import { Db } from 'mongodb';
import { getTenantDomainCollections } from '../models/domain';
import type { LogoCrop } from '../models/domain/tenant.models';
import { uploadTenantLogo, deleteOfferImage } from '../utils/cloudinary';

/**
 * Upload a new (pristine) logo and set it on the tenant, along with an optional
 * initial crop (applied at display time). A new upload always replaces the stored
 * crop: the provided crop is set, or the crop is cleared when none is given.
 * @returns the new secure logo URL + the stored crop.
 */
export async function setTenantLogo(
  db: Db,
  args: { tenantId: string; buffer: Buffer; filename: string; crop?: LogoCrop | null },
): Promise<{ logoUrl: string; logoCrop: LogoCrop | null }> {
  const { domainTenants } = getTenantDomainCollections(db);
  const existing = await domainTenants.findOne(
    { tenantId: args.tenantId },
    { projection: { logoUrl: 1 } },
  );

  const logoUrl = await uploadTenantLogo(args.buffer, args.filename);
  const crop = args.crop ?? null;
  await domainTenants.updateOne(
    { tenantId: args.tenantId },
    crop
      ? { $set: { logoUrl, logoCrop: crop, updatedAt: new Date() } }
      : { $set: { logoUrl, updatedAt: new Date() }, $unset: { logoCrop: '' } },
  );

  // Best-effort: drop the previous Cloudinary asset (never blocks the response).
  if (existing?.logoUrl && existing.logoUrl !== logoUrl) {
    void deleteOfferImage(existing.logoUrl);
  }
  return { logoUrl, logoCrop: crop };
}

/**
 * Set or clear the tenant logo's crop WITHOUT re-uploading the image (adjust the
 * crop, or revert to the full photo). crop=null clears it (full logo shown).
 * @returns the stored crop (or null when cleared).
 */
export async function setTenantLogoCrop(
  db: Db,
  args: { tenantId: string; crop: LogoCrop | null },
): Promise<{ logoCrop: LogoCrop | null }> {
  const { domainTenants } = getTenantDomainCollections(db);
  await domainTenants.updateOne(
    { tenantId: args.tenantId },
    args.crop
      ? { $set: { logoCrop: args.crop, updatedAt: new Date() } }
      : { $unset: { logoCrop: '' }, $set: { updatedAt: new Date() } },
  );
  return { logoCrop: args.crop };
}

/**
 * Set (or clear) the tenant's brand color.
 * @param brandColor a 6-digit hex string ("#635bff"), or null to clear it.
 * @returns the stored color, or null when cleared.
 */
export async function setTenantBrandColor(
  db: Db,
  args: { tenantId: string; brandColor: string | null },
): Promise<{ brandColor: string | null }> {
  const { domainTenants } = getTenantDomainCollections(db);
  if (args.brandColor === null) {
    await domainTenants.updateOne(
      { tenantId: args.tenantId },
      { $unset: { brandColor: '' }, $set: { updatedAt: new Date() } },
    );
    return { brandColor: null };
  }
  await domainTenants.updateOne(
    { tenantId: args.tenantId },
    { $set: { brandColor: args.brandColor, updatedAt: new Date() } },
  );
  return { brandColor: args.brandColor };
}

/** Clear the tenant's logo (revert to initials) + destroy the Cloudinary asset. */
export async function removeTenantLogo(db: Db, args: { tenantId: string }): Promise<void> {
  const { domainTenants } = getTenantDomainCollections(db);
  const existing = await domainTenants.findOne(
    { tenantId: args.tenantId },
    { projection: { logoUrl: 1 } },
  );
  await domainTenants.updateOne(
    { tenantId: args.tenantId },
    { $unset: { logoUrl: '', logoCrop: '' }, $set: { updatedAt: new Date() } },
  );
  if (existing?.logoUrl) void deleteOfferImage(existing.logoUrl);
}
