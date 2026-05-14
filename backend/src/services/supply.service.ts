/**
 * Supply Service - write authority for platform catalog offers.
 *
 * Build mode: the offer creator enters raw_cost; this service computes
 * nexus_price = raw_cost * 1.30 (30% platform margin) server-side.
 *
 * Security: raw_cost is stored in MongoDB but MUST NEVER be returned in
 * any API response. Callers are responsible for stripping it before sending
 * data to the client.
 *
 * Image uploads are handled via the Cloudinary signed-upload utility.
 * If no image is supplied a static placeholder URL is used instead.
 */

import { randomUUID } from 'node:crypto';
import { getMongoDb } from '../config/mongo';
import {
  getSupplyDomainCollections,
  type NexusOffer,
  type OfferCategory,
  type OfferVisibility,
} from '../models/domain/supply.models';
import { uploadOfferImage, defaultOfferImageUrl } from '../utils/cloudinary';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** NEXUS platform margin applied on top of raw provider cost. */
const NEXUS_PLATFORM_MARGIN = 0.30;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Computes the nexus_price from raw provider cost using the platform margin.
 *
 * Input:  rawCost - provider cost in ILS (must be positive).
 * Output: nexus_price rounded to 2 decimal places.
 */
function computeNexusPrice(rawCost: number): number {
  return Math.round(rawCost * (1 + NEXUS_PLATFORM_MARGIN) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Public input/output interfaces
// ---------------------------------------------------------------------------

/**
 * Fields required to create a new platform offer.
 * raw_cost is the provider cost in ILS; nexus_price is derived automatically.
 */
export interface CreateOfferInput {
  /** Display title shown to tenants and members. */
  title: string;
  /** Markdown-safe description of the offer. */
  description: string;
  /** Taxonomy category for filtering. */
  category: OfferCategory;
  /** Provider cost in ILS - used to compute nexus_price. Never exposed to frontend. */
  raw_cost: number;
  /** Optional recommended retail price for display purposes. */
  market_price?: number;
  /** Controls which tenants can see the offer in the platform catalog. */
  visibility: OfferVisibility;
  /** Raw image bytes to upload to Cloudinary. Optional - falls back to placeholder. */
  imageBuffer?: Buffer;
  /** Original filename used to derive a readable Cloudinary public_id. */
  imageFilename?: string;
  /** MongoDB tenantId of the creator (derived from server-side auth, not browser). */
  createdByTenantId: string;
  /** MongoDB identityId of the authenticated user creating the offer. */
  createdByIdentityId: string;
}

/**
 * Fields that may be updated on an existing offer.
 * When raw_cost changes, nexus_price is recomputed automatically.
 * Omitted fields are left unchanged.
 */
export interface UpdateOfferInput {
  /** New display title. */
  title?: string;
  /** New description text. */
  description?: string;
  /** Updated provider cost - triggers nexus_price recomputation. */
  raw_cost?: number;
  /** Updated recommended retail price. */
  market_price?: number;
  /** Lifecycle status change. */
  status?: 'active' | 'inactive';
  /** Replacement image bytes to upload to Cloudinary. */
  imageBuffer?: Buffer;
  /** Filename for the replacement image. */
  imageFilename?: string;
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Creates a new offer in the platform catalog.
 *
 * - Computes nexus_price = raw_cost * 1.30 server-side.
 * - Uploads image to Cloudinary when imageBuffer is provided; otherwise uses
 *   the default placeholder URL.
 * - For tenant_only offers, sets invitedByTenantId = createdByTenantId so
 *   visibility filtering works correctly.
 *
 * Input:  input - CreateOfferInput with raw_cost and optional image data.
 * Output: Promise resolving to the persisted NexusOffer document.
 * Throws: on Cloudinary failure or MongoDB write error.
 */
export async function createOffer(input: CreateOfferInput): Promise<NexusOffer> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  // Resolve image URL - prefer uploaded image, fall back to placeholder.
  let imageUrl = defaultOfferImageUrl();
  if (input.imageBuffer && input.imageFilename) {
    imageUrl = await uploadOfferImage(input.imageBuffer, input.imageFilename);
  }

  const now = new Date();

  const offer: NexusOffer = {
    offerId: randomUUID(),
    title: input.title,
    description: input.description,
    imageUrl,
    category: input.category,
    raw_cost: input.raw_cost,
    nexus_price: computeNexusPrice(input.raw_cost),
    market_price: input.market_price,
    status: 'active',
    visibility: input.visibility,
    createdByTenantId: input.createdByTenantId,
    createdByIdentityId: input.createdByIdentityId,
    // For tenant_only offers, restrict visibility to the creating tenant.
    invitedByTenantId:
      input.visibility === 'tenant_only' ? input.createdByTenantId : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await nexusOffers.insertOne(offer);
  return offer;
}

/**
 * Updates mutable fields on an existing offer.
 *
 * - Only the tenant that created the offer may update it (ownership enforced
 *   via the `createdByTenantId` filter in the MongoDB query).
 * - When raw_cost is present in the update, nexus_price is recomputed.
 * - When a new image buffer is provided, it is uploaded and the imageUrl
 *   field is replaced.
 *
 * Input:
 *   offerId  - UUID of the offer to update.
 *   tenantId - MongoDB tenantId derived from server-side auth (ownership check).
 *   input    - UpdateOfferInput with the fields to change.
 * Output: Promise resolving to the updated NexusOffer, or null when the offer
 *         does not exist or is not owned by tenantId.
 * Throws: on Cloudinary failure or MongoDB write error.
 */
export async function updateOffer(
  offerId: string,
  tenantId: string,
  input: UpdateOfferInput
): Promise<NexusOffer | null> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  // Upload replacement image only when both buffer and filename are supplied.
  let imageUrl: string | undefined;
  if (input.imageBuffer && input.imageFilename) {
    imageUrl = await uploadOfferImage(input.imageBuffer, input.imageFilename);
  }

  // Build a partial update, conditionally including only provided fields.
  // TypeScript partial spread keeps the update object strongly typed.
  const update: Partial<NexusOffer> = {
    updatedAt: new Date(),
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.raw_cost !== undefined && {
      raw_cost: input.raw_cost,
      nexus_price: computeNexusPrice(input.raw_cost),
    }),
    ...(input.market_price !== undefined && { market_price: input.market_price }),
    ...(input.status !== undefined && { status: input.status }),
    ...(imageUrl !== undefined && { imageUrl }),
  };

  const result = await nexusOffers.findOneAndUpdate(
    // Ownership guard: only the creating tenant can update this offer.
    { offerId, createdByTenantId: tenantId },
    { $set: update },
    { returnDocument: 'after' }
  );

  return result ?? null;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Lists all active platform offers that are visible to a specific tenant.
 *
 * Visibility rules:
 * - `ecosystem` offers are visible to all tenants.
 * - `tenant_only` offers are visible only to the tenant whose id matches
 *   invitedByTenantId.
 *
 * Input:
 *   tenantId - MongoDB tenantId of the requesting tenant.
 *   category - Optional category slug to narrow results; pass `'all'` or
 *              omit to return every category.
 * Output: Promise resolving to an array of NexusOffer sorted newest-first.
 *         Returns an empty array when no offers match.
 */
export async function listPlatformOffers(
  tenantId: string,
  category?: string
): Promise<NexusOffer[]> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  const filter: Record<string, unknown> = {
    status: 'active',
    $or: [
      { visibility: 'ecosystem' },
      { visibility: 'tenant_only', invitedByTenantId: tenantId },
    ],
  };

  // Apply category filter only when a specific category is requested.
  if (category && category !== 'all') {
    filter['category'] = category;
  }

  return nexusOffers.find(filter).sort({ createdAt: -1 }).toArray();
}
