/**
 * Multi-image upload helpers for offers.
 *
 * Splits the multi-image plumbing out of supply.service so that file stays
 * under the 350-line cap mandated by the project conventions. Owns three
 * responsibilities:
 *   1. Upload an array of buffers to Cloudinary in parallel and return URLs.
 *   2. Reconcile a kept-images list against the previous gallery, deleting
 *      orphans from Cloudinary so cost does not balloon over time.
 *   3. Bulk-delete every URL in a gallery when an offer is removed.
 *
 * Security: this module imports only the backend-only Cloudinary helper.
 * It must never be referenced by frontend code.
 */
import { uploadOfferImage, deleteOfferImage } from '../utils/cloudinary';
import { OFFER_IMAGES_MAX } from '../models/domain/supply.models';

/**
 * In-memory image file received via multer (`memoryStorage`).
 * Matches the subset of `Express.Multer.File` actually used during upload.
 */
export interface ImageUploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
}

/**
 * Uploads every buffer to Cloudinary in parallel and returns the resulting
 * public HTTPS URLs in the same order as the input array.
 *
 * Input:  files - up to OFFER_IMAGES_MAX in-memory multer file entries.
 * Output: array of secure URLs (length === files.length).
 * Throws: when Cloudinary returns a non-2xx for any individual upload.
 *
 * Order is preserved: the result array maps 1:1 with the input order so
 * callers can merge the new uploads into an existing gallery deterministically.
 */
export async function uploadOfferImages(files: ImageUploadFile[]): Promise<string[]> {
  if (files.length === 0) return [];
  return Promise.all(files.map((f) => uploadOfferImage(f.buffer, f.originalname)));
}

/**
 * Computes the final gallery for an offer being updated, given the previous
 * gallery, the kept-URL list from the client, and the freshly uploaded URLs.
 *
 * - Kept URLs are filtered to those that actually appeared in the previous
 *   gallery so a malicious client cannot inject foreign Cloudinary URLs.
 * - Newly uploaded URLs are appended after the kept ones in upload order.
 * - The final array is capped at OFFER_IMAGES_MAX as a defensive belt+suspenders
 *   on top of the multer count limit.
 *
 * Input:
 *   previous - the offer's current `imageUrls` (may be empty/undefined).
 *   keptUrls - URLs the user chose to keep, in the order they should appear.
 *              Foreign URLs are dropped without error.
 *   uploaded - new Cloudinary URLs from `uploadOfferImages`.
 * Output: { finalUrls, orphanedUrls } where `orphanedUrls` are the previous
 *         entries no longer present in keptUrls — caller deletes them from
 *         Cloudinary via `deleteOrphanedImages`.
 */
export function reconcileImageUrls(
  previous: string[] | undefined,
  keptUrls: string[],
  uploaded: string[],
): { finalUrls: string[]; orphanedUrls: string[] } {
  const previousSet = new Set(previous ?? []);
  const safeKept = keptUrls.filter((u) => previousSet.has(u));
  const safeKeptSet = new Set(safeKept);
  const orphanedUrls = (previous ?? []).filter((u) => !safeKeptSet.has(u));
  const finalUrls = [...safeKept, ...uploaded].slice(0, OFFER_IMAGES_MAX);
  return { finalUrls, orphanedUrls };
}

/**
 * Best-effort Cloudinary deletion of every URL in the input list.
 * Errors are swallowed by the underlying `deleteOfferImage`, so a Cloudinary
 * outage cannot block an offer update or delete.
 *
 * Input:  urls - Cloudinary URLs to remove.
 * Output: Promise<void> that resolves after every deletion attempt completes.
 */
export async function deleteOrphanedImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await Promise.all(urls.map((u) => deleteOfferImage(u)));
}
