/**
 * Supply Service - write authority for platform catalog offers.
 *
 * Image uploads are handled via the Cloudinary signed-upload utility.
 * If no image is supplied a static placeholder URL is used instead.
 *
 * Read and approval operations (listPlatformOffers, approveOffer, denyOffer) live in
 * supply-approval.service.ts to keep this file within the 350-line limit.
 */

import { randomUUID } from 'node:crypto';
import { getMongoDb } from '../config/mongo';
import { createError } from '../middleware/errorHandler';
import {
  getSupplyDomainCollections,
  deriveValueTypeFromExecutionType,
  NOT_DELETED,
  type NexusOffer,
  type OfferVariant,
  type OfferCategory,
  type OfferVisibility,
  type OfferExecutionType,
  type OfferVariantType,
  type OfferStatus,
  type OfferVoucherValidityUnit,
  type ImageCrop,
  type ImageCropEntry,
} from '../models/domain/supply.models';
import type { OfferRedemptionScope } from '../models/domain/supply-variants.models';
import {
  buildVoucherVariants,
  mirrorRepresentativeOntoOffer,
  lowestMemberPrice,
  type OfferVariantInput,
} from './supply-variants.helper';
import { defaultOfferImageUrl } from '../utils/cloudinary';
import {
  assertStatusReasonProvided,
  resolveStatusReasonValue,
} from './supply-status.helper';
import {
  uploadOfferImages,
  reconcileImageUrls,
  reconcileImageCrops,
  deleteOrphanedImages,
  type ImageUploadFile,
} from './supply-images.helper';
import { computeDisplayPrice } from './supply-price.helper';

// ---------------------------------------------------------------------------
// Public input/output interfaces
// ---------------------------------------------------------------------------

/**
 * Fields required to create a new platform offer.
 */
export interface CreateOfferInput {
  /** Display title shown to tenants and members. */
  title: string;
  /** Markdown-safe description of the offer. */
  description: string;
  /** Taxonomy category for filtering. */
  category: OfferCategory;
  /** Optional recommended retail price for display purposes. */
  market_price?: number;
  /** Controls which tenants can see the offer in the platform catalog. */
  visibility: OfferVisibility;
  /** How the offer is fulfilled/redeemed. Defaults to 'voucher' when omitted. */
  executionType?: OfferExecutionType;
  /** Maximum total units available across all tenants. null = unlimited. */
  stockLimit?: number | null;
  /** Direct URL where the offer can be redeemed. */
  implementationLink?: string | null;
  /** Human-readable redemption instructions. */
  implementationInstructions?: string;
  /** Offer goes live on this date. null means immediately available after approval. */
  validFrom?: Date | null;
  /** Offer expiry date. null means no expiry. Ignored for vouchers (forced null). */
  validUntil?: Date | null;
  /** Voucher redemption window amount (with voucherValidityUnit). null = never expires. Voucher-only. */
  voucherValidityValue?: number | null;
  /** Voucher redemption window unit. null = never expires. Voucher-only. */
  voucherValidityUnit?: OfferVoucherValidityUnit | null;
  /** Whether the voucher may be combined with other promotions. Voucher-only (required there). */
  voucherStackable?: boolean | null;
  /** Optional voucher card background color ("#rrggbb"). Voucher-only. */
  voucherBackgroundColor?: string | null;
  /** Optional voucher SKU / internal company code. Voucher-only. */
  sku?: string | null;
  /** Terms and conditions text. */
  terms?: string;
  /** Display tags set by the offer creator (max 10, each max 50 chars). */
  tags?: string[];
  /** Voucher face value. Required when executionType === 'voucher'. */
  face_value?: number;
  /** Cost Nexus pays the supplier. Stored server-side only; never exposed to adopting tenants. */
  nexus_cost?: number;
  /** Price end customers pay. Must satisfy: nexus_cost <= member_price <= face_value. */
  member_price?: number;
  /** Variant pricing shape; only 'fixed' exposed in v1 UI. Defaults to 'fixed'. */
  variantType?: OfferVariantType;
  /**
   * Voucher variants. When provided (and executionType === 'voucher') the offer
   * is persisted with these variants; the price/validity/etc. flat fields above
   * are then a mirror of the representative (lowest member_price) variant. When
   * omitted, a single variant is synthesized from the flat fields so the
   * pre-variant frontend keeps working. Ignored for non-voucher types.
   */
  variants?: OfferVariantInput[];
  /** Whether redemption terms/method are shared or per-variant. Voucher-only. */
  redemptionScope?: OfferRedemptionScope;
  /**
   * Up to OFFER_IMAGES_MAX in-memory image files (from multer). Index 0 becomes
   * the cover. Empty/omitted = the default placeholder URL is used.
   */
  imageFiles?: ImageUploadFile[];
  /**
   * Pre-hosted image URLs (already on Cloudinary, e.g. bulk CSV upload-from-URL).
   * When non-empty these are used as-is and `imageFiles` is ignored — no upload.
   */
  imageUrls?: string[];
  /**
   * Per-new-file crop metadata, aligned to `imageFiles` order (one entry per
   * file; null = full image). The file is uploaded pristine; the crop is stored
   * as metadata and applied at display time via Cloudinary transform URLs.
   */
  newImageCrops?: (ImageCrop | null)[];
  /** MongoDB tenantId of the creator (derived from server-side auth, not browser). */
  createdByTenantId: string;
  /** MongoDB identityId of the authenticated user creating the offer. */
  createdByIdentityId: string;
}

/**
 * Fields that may be updated on an existing offer.
 * Omitted fields are left unchanged.
 */
export interface UpdateOfferInput {
  /** New display title. */
  title?: string;
  /** New description text. */
  description?: string;
  /** Updated recommended retail price. */
  market_price?: number;
  /**
   * Lifecycle status change.
   * Transitions to 'disabled' or 'archived' require a non-empty statusReason
   * (enforced server-side in updateOffer).
   */
  status?: OfferStatus;
  /** Required when transitioning to 'disabled' or 'archived'. */
  statusReason?: string;
  /** Updated fulfillment/redemption type. */
  executionType?: OfferExecutionType;
  /** Updated stock cap. Set to null to make unlimited; omit to leave unchanged. */
  stockLimit?: number | null;
  /** Updated direct URL where the offer can be redeemed. */
  implementationLink?: string | null;
  /** Updated human-readable redemption instructions. */
  implementationInstructions?: string;
  /** Updated offer go-live date. null clears the gate (immediately live). */
  validFrom?: Date | null;
  /** Updated offer expiry date. null clears the expiry. Ignored for vouchers (forced null). */
  validUntil?: Date | null;
  /** Updated voucher redemption window amount. null = never expires. Voucher-only. */
  voucherValidityValue?: number | null;
  /** Updated voucher redemption window unit. null = never expires. Voucher-only. */
  voucherValidityUnit?: OfferVoucherValidityUnit | null;
  /** Updated combine-with-promotions choice. Voucher-only. */
  voucherStackable?: boolean | null;
  /** Updated voucher card background color ("#rrggbb"). Voucher-only. */
  voucherBackgroundColor?: string | null;
  /** Updated voucher SKU / internal company code. Voucher-only. */
  sku?: string | null;
  /** Updated terms and conditions text. */
  terms?: string;
  /** Updated display tags. */
  tags?: string[];
  /** Updated voucher face value. */
  face_value?: number;
  /** Updated supplier cost to Nexus (stored server-side only). */
  nexus_cost?: number;
  /** Updated end customer price. */
  member_price?: number;
  /** Updated variant type. Only 'fixed' is exposed in v1 UI. */
  variantType?: OfferVariantType;
  /**
   * Updated voucher variants. When provided (voucher), the variant array is
   * replaced wholesale and the flat mirror + displayPrice recomputed. Incoming
   * variants may carry an existing `variantId` to preserve it (and its inventory)
   * or omit it for a new variant. Omitted = variants left unchanged.
   */
  variants?: OfferVariantInput[];
  /** Updated redemption scope (shared vs per-variant). Voucher-only. */
  redemptionScope?: OfferRedemptionScope;
  /**
   * Brand-new image files to append to the gallery. Combined with
   * `keptImageUrls` they form the final ordered gallery.
   */
  imageFiles?: ImageUploadFile[];
  /**
   * Existing image URLs the client chose to keep, in the desired order.
   * Foreign URLs (not in the current `imageUrls`) are silently dropped to
   * prevent cross-offer URL injection. Omit/undefined = keep all existing.
   */
  keptImageUrls?: string[];
  /**
   * Current crop metadata for kept images (keyed by URL). The client sends the
   * full crop state for images it kept; undefined falls back to the offer's
   * existing `imageCrops` so a crop is never silently lost on an unrelated edit.
   */
  keptImageCrops?: ImageCropEntry[];
  /**
   * Per-new-file crop metadata, aligned to `imageFiles` upload order (null =
   * full image). Combined with `keptImageCrops` to rebuild the gallery's crops.
   */
  newImageCrops?: (ImageCrop | null)[];
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Creates a new offer in the platform catalog.
 *
 * - Uploads image to Cloudinary when imageBuffer is provided; otherwise uses
 *   the default placeholder URL.
 * - For tenant_only offers, sets invitedByTenantId = createdByTenantId so
 *   visibility filtering works correctly.
 *
 * Input:  input - CreateOfferInput with optional image data.
 * Output: Promise resolving to the persisted NexusOffer document.
 * Throws: on Cloudinary failure or MongoDB write error.
 */
export async function createOffer(input: CreateOfferInput): Promise<NexusOffer> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  // Resolve gallery. Pre-hosted URLs (bulk CSV) are used as-is; otherwise upload
  // every supplied file to Cloudinary. When neither is present we fall back to
  // the static placeholder so existing catalog cards still render correctly.
  let imageUrls: string[];
  // Crop metadata for freshly uploaded files (the original is stored pristine;
  // the crop is applied at display time). Pre-hosted URLs (bulk CSV) carry no
  // crops, so this stays empty on that path.
  let imageCrops: ImageCropEntry[] = [];
  if (input.imageUrls && input.imageUrls.length > 0) {
    imageUrls = input.imageUrls;
  } else {
    const uploaded = await uploadOfferImages(input.imageFiles ?? []);
    imageUrls = uploaded.length > 0 ? uploaded : [defaultOfferImageUrl()];
    imageCrops = reconcileImageCrops(imageUrls, uploaded, undefined, input.newImageCrops);
  }
  const imageUrl = imageUrls[0];

  const now = new Date();

  const executionType = input.executionType ?? 'voucher';
  const isVoucher = executionType === 'voucher';

  // Vouchers are a parent + one-or-more variants. Build the variant array (from
  // the client array, or synthesize one from the flat fields for the pre-variant
  // form), then MIRROR the representative (lowest member_price) variant onto the
  // legacy top-level fields so existing read sites + displayPrice keep working.
  const voucherVariants: OfferVariant[] | undefined = isVoucher
    ? buildVoucherVariants(input.variants, {
        face_value: input.face_value,
        nexus_cost: input.nexus_cost,
        // Default member_price to nexus_cost when omitted (per-variant); each
        // adopting tenant later sets their own price via TenantOfferConfig.
        member_price: input.member_price,
        voucherValidityValue: input.voucherValidityValue,
        voucherValidityUnit: input.voucherValidityUnit,
        voucherStackable: input.voucherStackable,
        sku: input.sku,
        tags: input.tags,
        terms: input.terms,
        implementationInstructions: input.implementationInstructions,
      })
    : undefined;
  const mirror = mirrorRepresentativeOntoOffer(voucherVariants);

  // Pricing: vouchers take the mirrored representative values; others take the
  // flat inputs unchanged. displayPrice for a voucher is the LOWEST variant
  // member price (the catalog "from"/sort price).
  const resolvedMemberPrice = isVoucher ? mirror.member_price : input.member_price;
  const displayPrice = computeDisplayPrice(
    executionType,
    isVoucher ? lowestMemberPrice(voucherVariants) : resolvedMemberPrice,
    input.market_price,
  );
  const resolvedFaceValue = isVoucher ? mirror.face_value : input.face_value;
  const resolvedNexusCost = isVoucher ? mirror.nexus_cost : input.nexus_cost;
  const resolvedTags = isVoucher ? (mirror.tags ?? []) : (input.tags ?? []);

  // Vouchers carry a purchase-anchored validity duration instead of absolute
  // dates; their validFrom/validUntil are always null. Non-voucher offers keep
  // their absolute dates and never carry a validity duration. Validity/stackable/
  // sku come from the mirrored representative variant for vouchers.
  const resolvedValidFrom = isVoucher ? null : (input.validFrom ?? null);
  const resolvedValidUntil = isVoucher ? null : (input.validUntil ?? null);
  const resolvedValidityValue = isVoucher ? (mirror.voucherValidityValue ?? null) : null;
  const resolvedValidityUnit = isVoucher ? (mirror.voucherValidityUnit ?? null) : null;
  const resolvedStackable = isVoucher ? (mirror.voucherStackable ?? null) : null;
  const resolvedBgColor = isVoucher ? (input.voucherBackgroundColor ?? null) : null;
  const resolvedSku = isVoucher ? (mirror.sku ?? null) : null;
  const resolvedRedemptionScope = isVoucher ? (input.redemptionScope ?? 'shared') : 'shared';

  // Voucher ecosystem offers enter pending_approval so a platform admin can review
  // pricing (especially nexus_cost) before the offer goes live to all tenants.
  const status =
    executionType === 'voucher' && input.visibility === 'ecosystem'
      ? 'pending_approval'
      : 'active';

  const offer: NexusOffer = {
    offerId: randomUUID(),
    title: input.title,
    description: input.description,
    imageUrl,
    imageUrls,
    ...(imageCrops.length > 0 && { imageCrops }),
    category: input.category,
    market_price: input.market_price,
    ...(displayPrice !== undefined && { displayPrice }),
    // Voucher pricing fields - only populated when executionType === 'voucher'
    // (mirrored from the representative variant).
    ...(resolvedFaceValue !== undefined && { face_value: resolvedFaceValue }),
    ...(resolvedNexusCost !== undefined && { nexus_cost: resolvedNexusCost }),
    ...(resolvedMemberPrice !== undefined && { member_price: resolvedMemberPrice }),
    status,
    visibility: input.visibility,
    executionType,
    // Spec value_type is auto-derived; v1 UI never sets it explicitly.
    valueType: deriveValueTypeFromExecutionType(executionType),
    // Provider entity lands in Phase 6; default to L1 for build-mode catalog math.
    financialModel: 'L1',
    // Only 'fixed' is exposed in v1 UI; flexible/subscription/bundle reserved.
    variantType: input.variantType ?? 'fixed',
    // ILS is the default v1 currency. Stored so transactions can lock it later.
    currency: 'ILS',
    stockLimit: input.stockLimit ?? null,
    stockUsed: 0,
    // Vouchers redeem via their inventory (barcodes/links), not a single
    // offer-level link, so implementationLink is never stored for vouchers.
    implementationLink: isVoucher ? null : (input.implementationLink ?? null),
    implementationInstructions: input.implementationInstructions ?? '',
    validFrom: resolvedValidFrom,
    validUntil: resolvedValidUntil,
    voucherValidityValue: resolvedValidityValue,
    voucherValidityUnit: resolvedValidityUnit,
    voucherStackable: resolvedStackable,
    voucherBackgroundColor: resolvedBgColor,
    sku: resolvedSku,
    terms: input.terms ?? '',
    tags: resolvedTags,
    redemptionScope: resolvedRedemptionScope,
    ...(voucherVariants !== undefined && { variants: voucherVariants }),
    // Status reason / changedAt are set when a future PATCH transitions to disabled/archived.
    statusReason: null,
    statusChangedAt: now,
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
 * - When a new image buffer is provided, it is uploaded and the imageUrl field is replaced.
 * - Resubmit logic: if the offer's current status is 'denied', the update automatically
 *   transitions it back to 'pending_approval' and clears the denial_reason.
 *
 * Input:
 *   offerId  - UUID of the offer to update.
 *   tenantId - MongoDB tenantId derived from server-side auth (ownership check).
 *   input    - UpdateOfferInput with the fields to change.
 * Output: Promise resolving to { offer, wasResubmitted, wasUpdatedWhilePending } on success,
 *         or null when the offer does not exist or is not owned by tenantId.
 *   wasResubmitted        - true when a denied offer was edited back into the approval queue.
 *   wasUpdatedWhilePending - true when the offer was already pending_approval before this edit.
 * Throws: on Cloudinary failure or MongoDB write error.
 */
export async function updateOffer(
  offerId: string,
  tenantId: string,
  input: UpdateOfferInput,
  isPlatformAdmin = false,
): Promise<{ offer: NexusOffer; wasResubmitted: boolean; wasUpdatedWhilePending: boolean } | null> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  // Read current offer to detect denied status for resubmit flow.
  // Ownership is checked here to avoid a redundant DB round trip on not-found.
  const currentOffer = await nexusOffers.findOne({ offerId, createdByTenantId: tenantId, ...NOT_DELETED });
  if (!currentOffer) return null;

  // When a denied offer is edited and saved, it re-enters the approval queue.
  const wasResubmitted = currentOffer.status === 'denied';
  // Track separately: offer was already waiting for approval when updated.
  // Routes use this to re-notify admins with the latest offer details.
  const wasUpdatedWhilePending = currentOffer.status === 'pending_approval';

  // Spec rule: 'disabled' / 'archived' transitions must carry a non-empty reason.
  // Fail fast before any Cloudinary upload or DB write.
  assertStatusReasonProvided(input.status, input.statusReason);

  // Reconcile gallery. Only touched when the client signals a change by
  // sending `keptImageUrls` (even if empty) or new `imageFiles`. Otherwise the
  // existing imageUrls + imageUrl are left intact.
  let nextImageUrls: string[] | undefined;
  let nextImageUrl: string | undefined;
  // Crop metadata follows the gallery (keyed by URL). Recomputed whenever the
  // gallery changes OR a crop-only change is sent (e.g. re-cropping an existing
  // image without adding/removing/reordering). undefined = leave crops intact.
  let nextImageCrops: ImageCropEntry[] | undefined;
  const galleryTouched = input.keptImageUrls !== undefined
    || (input.imageFiles && input.imageFiles.length > 0);
  const cropsTouched = input.keptImageCrops !== undefined || input.newImageCrops !== undefined;
  if (galleryTouched) {
    const uploaded = await uploadOfferImages(input.imageFiles ?? []);
    const kept = input.keptImageUrls ?? currentOffer.imageUrls ?? [];
    const { finalUrls, orphanedUrls } = reconcileImageUrls(
      currentOffer.imageUrls,
      kept,
      uploaded,
    );
    // Fire-and-forget orphan deletion: failure must not block the save.
    deleteOrphanedImages(orphanedUrls).catch((err) =>
      console.error('[SUPPLY] Orphan image cleanup failed:', err),
    );
    nextImageUrls = finalUrls;
    nextImageUrl = finalUrls[0] ?? defaultOfferImageUrl();
    nextImageCrops = reconcileImageCrops(
      finalUrls,
      uploaded,
      input.keptImageCrops ?? currentOffer.imageCrops,
      input.newImageCrops,
    );
  } else if (cropsTouched) {
    // Crop-only edit: no URL/file change. Recompute against the existing gallery.
    const finalUrls = currentOffer.imageUrls ?? [];
    nextImageCrops = reconcileImageCrops(
      finalUrls,
      [],
      input.keptImageCrops ?? currentOffer.imageCrops,
      undefined,
    );
  }

  const now = new Date();
  const statusActuallyChanged =
    input.status !== undefined && input.status !== currentOffer.status;
  // executionType change re-derives valueType so the spec field stays in sync.
  const derivedValueType = input.executionType !== undefined
    ? deriveValueTypeFromExecutionType(input.executionType)
    : undefined;
  const resolvedStatusReason = resolveStatusReasonValue(
    input.status, statusActuallyChanged, input.statusReason,
  );

  // Recompute displayPrice from the merged (existing + patch) values so the
  // denormalized column stays correct even when the caller only sends one of
  // the three inputs.
  const mergedExecutionType = input.executionType ?? currentOffer.executionType;
  const isVoucherUpdate = mergedExecutionType === 'voucher';
  // Voucher vs non-voucher normalization for the expiry/validity fields:
  //   - voucher    -> absolute dates forced null; validity duration applied
  //                   from input (when sent). Normalizes legacy vouchers that
  //                   still carry an old validUntil.
  //   - non-voucher -> keep absolute dates as sent; clear any stale validity
  //                   duration left over from a previous voucher state.
  const validityUpdate: Partial<NexusOffer> = isVoucherUpdate
    ? {
        validFrom: null,
        validUntil: null,
        ...(input.voucherValidityValue !== undefined && { voucherValidityValue: input.voucherValidityValue }),
        ...(input.voucherValidityUnit !== undefined && { voucherValidityUnit: input.voucherValidityUnit }),
        ...(input.voucherStackable !== undefined && { voucherStackable: input.voucherStackable }),
        ...(input.voucherBackgroundColor !== undefined && { voucherBackgroundColor: input.voucherBackgroundColor }),
        ...(input.sku !== undefined && { sku: input.sku }),
      }
    : {
        ...(input.validFrom !== undefined && { validFrom: input.validFrom }),
        ...(input.validUntil !== undefined && { validUntil: input.validUntil }),
        voucherValidityValue: null,
        voucherValidityUnit: null,
        voucherStackable: null,
        voucherBackgroundColor: null,
        sku: null,
      };
  const mergedMemberPrice =
    input.member_price !== undefined ? input.member_price : currentOffer.member_price;
  const mergedMarketPrice =
    input.market_price !== undefined ? input.market_price : currentOffer.market_price;
  const nextDisplayPrice = computeDisplayPrice(
    mergedExecutionType,
    mergedMemberPrice,
    mergedMarketPrice,
  );

  // Variant update (voucher only). When the client sends a `variants` array the
  // whole array is replaced; the representative variant is then mirrored onto the
  // flat top-level fields and displayPrice is recomputed as the lowest member
  // price. These mirrored values are spread LAST in `update` so they win over the
  // per-field flat spreads. When `variants` is omitted, variants are left
  // untouched (the pre-variant form keeps editing the flat fields directly).
  let variantMirror: Partial<NexusOffer> = {};
  let variantSet: Partial<NexusOffer> = {};
  let variantDisplayPrice: number | undefined;
  if (isVoucherUpdate && input.variants !== undefined) {
    const built = buildVoucherVariants(input.variants, {
      face_value: input.face_value ?? currentOffer.face_value,
      nexus_cost: input.nexus_cost ?? currentOffer.nexus_cost,
      member_price: input.member_price ?? currentOffer.member_price,
      voucherValidityValue: input.voucherValidityValue,
      voucherValidityUnit: input.voucherValidityUnit,
      voucherStackable: input.voucherStackable,
      sku: input.sku,
      tags: input.tags,
      terms: input.terms,
      implementationInstructions: input.implementationInstructions,
    });
    // Pricing lock: face_value + nexus_cost are the Nexus<->supplier deal and are
    // platform-admin-only after create. A non-admin may not add a variant or
    // change an existing variant's face_value/nexus_cost (which would move the
    // Nexus margin). Each built variant must match a stored variant by id with
    // identical face_value + nexus_cost. Removing variants and editing non-price
    // fields stays allowed. (Members adjust their own price via TenantOfferConfig.)
    if (!isPlatformAdmin) {
      const stored = new Map((currentOffer.variants ?? []).map((v) => [v.variantId, v]));
      for (const v of built) {
        const prev = stored.get(v.variantId);
        if (!prev || prev.face_value !== v.face_value || prev.nexus_cost !== v.nexus_cost) {
          throw createError('voucher_pricing_locked', 403);
        }
      }
    }
    variantSet = { variants: built };
    variantMirror = mirrorRepresentativeOntoOffer(built);
    variantDisplayPrice = computeDisplayPrice('voucher', lowestMemberPrice(built), mergedMarketPrice);
  }
  if (isVoucherUpdate && input.redemptionScope !== undefined) {
    variantSet.redemptionScope = input.redemptionScope;
  }

  const update: Partial<NexusOffer> = {
    updatedAt: now,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.market_price !== undefined && { market_price: input.market_price }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.executionType !== undefined && { executionType: input.executionType }),
    ...(derivedValueType !== undefined && { valueType: derivedValueType }),
    ...(input.variantType !== undefined && { variantType: input.variantType }),
    ...(input.stockLimit !== undefined && { stockLimit: input.stockLimit }),
    ...(input.implementationLink !== undefined && { implementationLink: input.implementationLink }),
    // Vouchers never keep an offer-level implementation link (inventory handles
    // redemption); force it null when the merged type is voucher.
    ...(isVoucherUpdate && { implementationLink: null }),
    ...(input.implementationInstructions !== undefined && { implementationInstructions: input.implementationInstructions }),
    // Voucher/non-voucher expiry + validity normalization (computed above).
    ...validityUpdate,
    ...(input.terms !== undefined && { terms: input.terms }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.face_value !== undefined && { face_value: input.face_value }),
    ...(input.nexus_cost !== undefined && { nexus_cost: input.nexus_cost }),
    ...(input.member_price !== undefined && { member_price: input.member_price }),
    ...(nextDisplayPrice !== undefined && { displayPrice: nextDisplayPrice }),
    ...(nextImageUrls !== undefined && { imageUrls: nextImageUrls }),
    ...(nextImageUrl !== undefined && { imageUrl: nextImageUrl }),
    ...(nextImageCrops !== undefined && { imageCrops: nextImageCrops }),
    ...(statusActuallyChanged && { statusChangedAt: now }),
    ...(resolvedStatusReason !== undefined && { statusReason: resolvedStatusReason }),
    // Resubmit: clear denial and move back to approval queue.
    ...(wasResubmitted && { status: 'pending_approval', denial_reason: '' }),
    // Variant mirror + array win over the flat spreads above (voucher edit only).
    ...variantMirror,
    ...variantSet,
    ...(variantDisplayPrice !== undefined && { displayPrice: variantDisplayPrice }),
  };

  const result = await nexusOffers.findOneAndUpdate(
    // Ownership guard: only the creating tenant can update this offer. Deleted
    // offers are excluded so an edit can never resurrect a deleted offer.
    { offerId, createdByTenantId: tenantId, ...NOT_DELETED },
    { $set: update },
    { returnDocument: 'after' }
  );

  if (!result) return null;
  return { offer: result, wasResubmitted, wasUpdatedWhilePending };
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Delete operations
// ---------------------------------------------------------------------------

/**
 * Soft-deletes an offer and cascades removal from all tenant catalogs.
 *
 * - Sets offer.deletedAt (authoritative delete marker) and status = 'inactive'
 *   so purchase history references remain intact while the offer is excluded
 *   from every read and every status sweep.
 * - Deletes all TenantOfferConfig adoption records for this offer so it
 *   disappears from every tenant's member-facing catalog immediately.
 * - Attempts to remove the image from Cloudinary; errors are swallowed so that
 *   a Cloudinary failure can never block the offer from being deleted.
 * - Does NOT touch any transaction or purchase records.
 *
 * Authorization:
 *   - Tenant admins may only delete offers they created (createdByTenantId match).
 *   - Platform admins (isPlatformAdmin = true) may delete any offer.
 *
 * Input:
 *   offerId         - UUID of the offer to delete.
 *   tenantId        - MongoDB tenantId of the requester (derived from server-side auth).
 *   isPlatformAdmin - When true, ownership check is skipped.
 * Output: Promise resolving to the offer document captured before soft-deletion.
 *         Callers can inspect the returned offer (e.g. to check status for email triggers).
 * Throws: Error with status 404 when the offer is not found or the requester
 *         does not own it (and is not a platform admin).
 */
export async function deleteOffer(
  offerId: string,
  tenantId: string,
  isPlatformAdmin: boolean,
): Promise<NexusOffer> {
  const db = await getMongoDb();
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  // Platform admins can delete any offer; tenant admins only their own.
  // Already-deleted offers are excluded so a repeat delete returns 404 cleanly.
  const ownerFilter = isPlatformAdmin
    ? { offerId, ...NOT_DELETED }
    : { offerId, createdByTenantId: tenantId, ...NOT_DELETED };

  const offer = await nexusOffers.findOne(ownerFilter);
  if (!offer) throw Object.assign(new Error('Offer not found'), { status: 404 });

  // Attempt Cloudinary cleanup for every image in the gallery (plus the legacy
  // cover when not already in the array). Errors are swallowed in
  // deleteOrphanedImages so deletion is never blocked by Cloudinary.
  const gallery = offer.imageUrls ?? [];
  const legacyCover = offer.imageUrl && !gallery.includes(offer.imageUrl)
    ? [offer.imageUrl]
    : [];
  await deleteOrphanedImages([...gallery, ...legacyCover]);

  // Soft delete - keeps the document so transaction/purchase history stays
  // intact. `deletedAt` is the authoritative deletion marker (orthogonal to
  // status); status is also set inactive so the offer drops out of any
  // status-based query. Reads + status sweeps both filter on `deletedAt`, so a
  // deleted offer can never resurface (e.g. on service re-activation).
  await nexusOffers.updateOne(
    { offerId },
    { $set: { status: 'inactive', deletedAt: new Date(), updatedAt: new Date() } },
  );

  // Cascade - remove every tenant's adoption record for this offer immediately.
  await tenantOfferConfigs.deleteMany({ offerId });

  return offer;
}

// ---------------------------------------------------------------------------
// Phase 4 hook - stock management
// ---------------------------------------------------------------------------

/**
 * Atomically increments stockUsed for an offer after a confirmed purchase.
 *
 * Uses findOneAndUpdate with a guard condition so the increment only
 * happens when the offer is still active and has stock remaining.
 * Unlimited offers (stockLimit = null) are always incremented.
 *
 * Called by Phase 4 purchase service after payment confirmation.
 *
 * Input:  offerId - UUID of the purchased offer.
 * Output: Promise resolving to the updated stockUsed count.
 * Throws: Error with .status = 409 when the offer is sold out, not active,
 *         or not found.
 */
export async function decrementStock(offerId: string): Promise<number> {
  const db = await getMongoDb();
  const { nexusOffers } = getSupplyDomainCollections(db);

  // Guard: allow increment only when there is remaining stock or no limit.
  const result = await nexusOffers.findOneAndUpdate(
    {
      offerId,
      status: 'active',
      ...NOT_DELETED,
      $or: [
        { stockLimit: null },
        { $expr: { $lt: ['$stockUsed', '$stockLimit'] } },
      ],
    },
    { $inc: { stockUsed: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!result) {
    throw Object.assign(
      new Error('Offer is sold out or not available'),
      { status: 409 },
    );
  }
  return result.stockUsed;
}
