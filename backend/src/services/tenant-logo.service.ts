/**
 * Tenant (organization) logo lifecycle. Uploads the square-cropped logo to
 * Cloudinary, stores the secure URL on the Tenant, and best-effort cleans up the
 * previous Cloudinary asset. Removing clears the URL (the UI falls back to the
 * tenant-name initials).
 */
import { Db } from 'mongodb';
import { getTenantDomainCollections } from '../models/domain';
import { uploadTenantLogo, deleteOfferImage } from '../utils/cloudinary';

/**
 * Upload a new logo and set it on the tenant.
 * @returns the new secure logo URL.
 */
export async function setTenantLogo(
  db: Db,
  args: { tenantId: string; buffer: Buffer; filename: string },
): Promise<{ logoUrl: string }> {
  const { domainTenants } = getTenantDomainCollections(db);
  const existing = await domainTenants.findOne(
    { tenantId: args.tenantId },
    { projection: { logoUrl: 1 } },
  );

  const logoUrl = await uploadTenantLogo(args.buffer, args.filename);
  await domainTenants.updateOne(
    { tenantId: args.tenantId },
    { $set: { logoUrl, updatedAt: new Date() } },
  );

  // Best-effort: drop the previous Cloudinary asset (never blocks the response).
  if (existing?.logoUrl && existing.logoUrl !== logoUrl) {
    void deleteOfferImage(existing.logoUrl);
  }
  return { logoUrl };
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
    { $unset: { logoUrl: '' }, $set: { updatedAt: new Date() } },
  );
  if (existing?.logoUrl) void deleteOfferImage(existing.logoUrl);
}
