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
import {
  getSupplyDomainCollections,
  deriveValueTypeFromExecutionType,
  NOT_DELETED,
  NEXUS_FEE_DEFAULT_PCT,
  type NexusOffer,
  type OfferVariant,
  type OfferCategory,
  type OfferVisibility,
  type OfferExecutionType,
  type OfferVariantType,
  type OfferStatus,
  type ImageCrop,
  type ImageCropEntry,
} from '../models/domain/supply.models';
import type { OfferRedemptionScope, ValidityType } from '../models/domain/supply-variants.models';
import {
  buildVoucherVariants,
  mirrorRepresentativeOntoOffer,
  lowestMemberPrice,
  type OfferVariantInput,
} from './supply-variants.helper';
import { defaultOfferImageUrl, uploadOfferImageFromUrl } from '../utils/cloudinary';
import {
  assertStatusReasonProvided,
  resolveStatusReasonValue,
  resolveCreateStatus,
} from './supply-status.helper';
import {
  uploadOfferImages,
  reconcileImageUrls,
  reconcileImageCrops,
  deleteOrphanedImages,
  type ImageUploadFile,
} from './supply-images.helper';
import { computeDisplayPrice } from './supply-price.helper';
import { offerSearchWriteFields } from './offer-search-fields.helper';
import { resolveVoucherMaxPayments } from './supply-voucher.helper';
import { isTenantAutoApprove } from './admin-tenants.service';
import { getVoucherCodeCollection } from '../models/domain/voucher-codes.models';
import { clampTenantVariantPricesToBounds, resetTenantPricesForChangedVariants } from './tenant-pricing.service';
import { autoAdoptOfferForAllTenants } from './admin-offer-auto-adopt.service';

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
  /** Optional https:// link to a page listing participating branches. Voucher-only. */
  branchListUrl?: string | null;
  /** Offer goes live on this date. null means immediately available after approval. */
  validFrom?: Date | null;
  /** Offer expiry date. null means no expiry. Ignored for vouchers (forced null). */
  validUntil?: Date | null;
  /** Voucher validity TYPE default for the offer ('limit' | 'from_until'). The
   *  validity VALUE is set per inventory unit. Voucher-only. See voucher-validity-dating. */
  defaultValidityType?: ValidityType | null;
  /** Whether the voucher may be combined with other promotions. Voucher-only (required there). */
  voucherStackable?: boolean | null;
  /** Optional voucher card background color ("#rrggbb"). Voucher-only. */
  voucherBackgroundColor?: string | null;
  /** Optional voucher SKU / internal company code. Voucher-only. */
  sku?: string | null;
  /** Max credit-card payments for this voucher (offer-level). Voucher-only;
   *  defaults to VOUCHER_PAYMENTS_DEFAULT when omitted. */
  maxPayments?: number;
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
  /**
   * URL-sourced images (route-validated http(s) only): each is RE-HOSTED via
   * Cloudinary fetch-by-URL (Cloudinary downloads it, never this server) and
   * appended to the gallery AFTER the uploaded files. Only the re-hosted
   * Cloudinary URL is ever stored - the user's URL is never persisted.
   */
  remoteImages?: { url: string; crop: ImageCrop | null }[];
  /** MongoDB tenantId of the creator (derived from server-side auth, not browser). */
  createdByTenantId: string;
  /** MongoDB identityId of the authenticated user creating the offer. */
  createdByIdentityId: string;
  /**
   * M7: force an ecosystem offer to 'active' instead of 'pending_approval' - set
   * when a platform admin uploads on behalf of a tenant (implicit approval).
   */
  forceActiveStatus?: boolean;
  /** M9: acting uploader identity when created on behalf by an admin. */
  uploadedByIdentityId?: string;
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
  /**
   * Change who can see the offer: 'ecosystem' (all tenants) or 'tenant_only'
   * (owning tenant's members only). Honored ONLY for platform admins (the route
   * strips it for everyone else) - a platform admin editing implicitly approves,
   * so the offer goes 'active' immediately on change.
   */
  visibility?: OfferVisibility;
  /**
   * Reassign the owning tenant (platform-admin only). When set to a tenant other
   * than the current owner, the offer is re-stamped to it and removed from the
   * old owner's catalog. The route resolves + validates the tenant and supplies
   * its owner identity via ownerIdentityId.
   */
  ownerTenantId?: string;
  /** New owner's identity id (the target tenant's createdByIdentityId). Set with ownerTenantId. */
  ownerIdentityId?: string;
  /** Updated fulfillment/redemption type. */
  executionType?: OfferExecutionType;
  /** Updated stock cap. Set to null to make unlimited; omit to leave unchanged. */
  stockLimit?: number | null;
  /** Updated direct URL where the offer can be redeemed. */
  implementationLink?: string | null;
  /** Updated human-readable redemption instructions. */
  implementationInstructions?: string;
  /** Updated branch-list link. null clears it. Voucher-only. */
  branchListUrl?: string | null;
  /** Updated offer go-live date. null clears the gate (immediately live). */
  validFrom?: Date | null;
  /** Updated offer expiry date. null clears the expiry. Ignored for vouchers (forced null). */
  validUntil?: Date | null;
  /** Updated voucher validity TYPE default ('limit' | 'from_until'). The validity
   *  VALUE is set per inventory unit. Voucher-only. See voucher-validity-dating. */
  defaultValidityType?: ValidityType | null;
  /** Updated combine-with-promotions choice. Voucher-only. */
  voucherStackable?: boolean | null;
  /** Updated voucher card background color ("#rrggbb"). Voucher-only. */
  voucherBackgroundColor?: string | null;
  /** Updated voucher SKU / internal company code. Voucher-only. */
  sku?: string | null;
  /** Updated max credit-card payments (offer-level). Voucher-only. */
  maxPayments?: number;
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
  /**
   * URL-sourced images to append (route-validated http(s) only): re-hosted via
   * Cloudinary fetch-by-URL and appended after uploaded files. Only the
   * re-hosted Cloudinary URL is stored - the user's URL is never persisted.
   */
  remoteImages?: { url: string; crop: ImageCrop | null }[];
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
/**
 * Re-hosts URL-sourced images and appends them (URLs + aligned crops) after
 * the freshly-uploaded file URLs. Pads the file-crop list to the uploaded
 * count first so the remote crops align correctly even when the caller sent
 * no file crops. Shared by createOffer + updateOffer.
 */
async function appendRemoteImages(
  uploaded: string[],
  newImageCrops: (ImageCrop | null)[] | undefined,
  remoteImages: { url: string; crop: ImageCrop | null }[] | undefined,
): Promise<{ urls: string[]; crops: (ImageCrop | null)[] | undefined }> {
  if (!remoteImages || remoteImages.length === 0) {
    return { urls: uploaded, crops: newImageCrops };
  }
  const rehosted: string[] = [];
  for (const remote of remoteImages) {
    rehosted.push(await uploadOfferImageFromUrl(remote.url));
  }
  const paddedFileCrops = uploaded.map((_, index) => newImageCrops?.[index] ?? null);
  return {
    urls: [...uploaded, ...rehosted],
    crops: [...paddedFileCrops, ...remoteImages.map((remote) => remote.crop)],
  };
}

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
    // URL-sourced images: re-host each via Cloudinary fetch-by-URL (route
    // pre-validated http(s)), appended AFTER the uploaded files. Crops align
    // per source list, so pad the file crops before appending remote crops.
    const { urls: allNew, crops: allNewCrops } = await appendRemoteImages(
      uploaded, input.newImageCrops, input.remoteImages,
    );
    imageUrls = allNew.length > 0 ? allNew : [defaultOfferImageUrl()];
    imageCrops = reconcileImageCrops(imageUrls, allNew, undefined, allNewCrops);
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
        // member_price here is only the legacy fallback for variants missing
        // cost/face; priced variants get member_price DERIVED from the nexus fee.
        member_price: input.member_price,
        // Validity VALUE is per inventory unit, not the variant. The flat
        // single-variant inherits the offer's defaultValidityType (override null).
        voucherStackable: input.voucherStackable,
        sku: input.sku,
        tags: input.tags,
        terms: input.terms,
        implementationInstructions: input.implementationInstructions,
      }, NEXUS_FEE_DEFAULT_PCT)
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
  // Voucher validity VALUE now lives per inventory unit; the legacy parent mirror
  // fields are always null. The validity TYPE default lives on the offer. See
  // voucher-validity-dating.
  const resolvedStackable = isVoucher ? (mirror.voucherStackable ?? null) : null;
  const resolvedBgColor = isVoucher ? (input.voucherBackgroundColor ?? null) : null;
  const resolvedSku = isVoucher ? (mirror.sku ?? null) : null;
  const resolvedMaxPayments = resolveVoucherMaxPayments(isVoucher, input.maxPayments);
  const resolvedRedemptionScope = isVoucher ? (input.redemptionScope ?? 'shared') : 'shared';
  const resolvedDefaultValidityType = isVoucher ? (input.defaultValidityType ?? null) : null;

  // Voucher ecosystem offers enter pending_approval so a platform admin can review
  // pricing (especially nexus_cost) before the offer goes live to all tenants -
  // unless the creating tenant is trusted (autoApproveOffers) OR forceActiveStatus
  // is set (M7: an admin uploading on behalf implicitly approves). Every other
  // offer is 'active'.
  let status: NexusOffer['status'] = 'active';
  if (executionType === 'voucher' && input.visibility === 'ecosystem') {
    const trusted = await isTenantAutoApprove(input.createdByTenantId);
    status = resolveCreateStatus({ visibility: 'ecosystem', trusted, forceActive: input.forceActiveStatus === true });
  }

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
    // Derived search fields: plain-text description mirror + base cashback
    // range (see offer-search-fields.helper).
    ...offerSearchWriteFields({
      description: input.description,
      variants: voucherVariants,
      flatFaceValue: resolvedFaceValue,
      flatMemberPrice: resolvedMemberPrice,
    }),
    // Voucher pricing fields - only populated when executionType === 'voucher'
    // (mirrored from the representative variant).
    ...(resolvedFaceValue !== undefined && { face_value: resolvedFaceValue }),
    ...(resolvedNexusCost !== undefined && { nexus_cost: resolvedNexusCost }),
    ...(resolvedMemberPrice !== undefined && { member_price: resolvedMemberPrice }),
    // Platform fee intent; the fee-inflated price is already baked into each
    // variant's member_price above. Voucher-only.
    ...(isVoucher && { nexusFeePct: NEXUS_FEE_DEFAULT_PCT }),
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
    // Branch list is the opposite of implementationLink: voucher-only.
    branchListUrl: isVoucher ? (input.branchListUrl ?? null) : null,
    validFrom: resolvedValidFrom,
    validUntil: resolvedValidUntil,
    // Legacy parent validity mirror is no longer populated (per-unit now).
    voucherValidityValue: null,
    voucherValidityUnit: null,
    voucherStackable: resolvedStackable,
    voucherBackgroundColor: resolvedBgColor,
    sku: resolvedSku,
    maxPayments: resolvedMaxPayments,
    terms: input.terms ?? '',
    tags: resolvedTags,
    redemptionScope: resolvedRedemptionScope,
    defaultValidityType: resolvedDefaultValidityType,
    ...(voucherVariants !== undefined && { variants: voucherVariants }),
    // Status reason / changedAt are set when a future PATCH transitions to disabled/archived.
    statusReason: null,
    statusChangedAt: now,
    createdByTenantId: input.createdByTenantId,
    createdByIdentityId: input.createdByIdentityId,
    ...(input.uploadedByIdentityId ? { uploadedByIdentityId: input.uploadedByIdentityId } : {}),
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
  const { nexusOffers, tenantOfferConfigs } = getSupplyDomainCollections(db);

  // Ownership scope. Platform admins may edit ANY offer (mirrors deleteOffer),
  // including ones uploaded on behalf of a tenant (whose createdByTenantId is the
  // TARGET tenant, not the admin's). Tenant editors are restricted to offers their
  // own tenant created and may NOT touch Nexus-managed on-behalf offers.
  const ownerFilter = isPlatformAdmin
    ? { offerId, ...NOT_DELETED }
    : { offerId, createdByTenantId: tenantId, uploadedByIdentityId: { $exists: false }, ...NOT_DELETED };

  const currentOffer = await nexusOffers.findOne(ownerFilter);
  if (!currentOffer) return null;

  // Visibility change (platform-admin only; the route strips it for everyone
  // else). Flipping to tenant_only scopes the read query via invitedByTenantId
  // (reads match a tenant_only offer only when invitedByTenantId === the viewer);
  // flipping to ecosystem needs no unset (the ecosystem read clause ignores that
  // field). The admin implicitly approves, so the offer goes active immediately.
  const visibilityChange =
    isPlatformAdmin &&
    input.visibility !== undefined &&
    input.visibility !== currentOffer.visibility;

  // Owner reassignment (platform-admin only; the route resolves + validates the
  // target tenant and strips this for everyone else). Re-stamps the offer to the
  // new tenant + its owner identity. The effective owner/visibility below fold in
  // whichever of the two changed so invitedByTenantId (tenant_only scope) lands on
  // the right tenant even when only one of them changed.
  const ownerChange =
    isPlatformAdmin &&
    input.ownerTenantId !== undefined &&
    input.ownerTenantId !== currentOffer.createdByTenantId;
  const effectiveOwner = ownerChange ? input.ownerTenantId! : currentOffer.createdByTenantId;
  const effectiveVisibility = visibilityChange ? input.visibility! : currentOffer.visibility;

  // When a denied offer is edited and saved, it re-enters the approval queue.
  const wasResubmitted = currentOffer.status === 'denied';
  // Track separately: offer was already waiting for approval when updated.
  // Routes use this to re-notify admins with the latest offer details.
  const wasUpdatedWhilePending = currentOffer.status === 'pending_approval';

  // Deal pricing (face_value + nexus_cost) is editable by the OWNING tenant for
  // BOTH visibilities (2026-07-06: the previous ecosystem platform-admin-only
  // lock - 403 voucher_pricing_locked - was removed on request). Ownership is
  // guaranteed by the createdByTenantId query above and the route requires
  // supply.manage_offers; Nexus-managed on-behalf offers still cannot reach
  // this path for their owner at all. Per-tenant price overrides are re-synced
  // after the save (snap for tenant_only, clamp for ecosystem - see below).

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
    || (input.imageFiles && input.imageFiles.length > 0)
    || (input.remoteImages && input.remoteImages.length > 0);
  const cropsTouched = input.keptImageCrops !== undefined || input.newImageCrops !== undefined;
  if (galleryTouched) {
    const uploaded = await uploadOfferImages(input.imageFiles ?? []);
    // URL-sourced images re-host + append after the files (crops aligned).
    const { urls: allNew, crops: allNewCrops } = await appendRemoteImages(
      uploaded, input.newImageCrops, input.remoteImages,
    );
    const kept = input.keptImageUrls ?? currentOffer.imageUrls ?? [];
    const { finalUrls, orphanedUrls } = reconcileImageUrls(
      currentOffer.imageUrls,
      kept,
      allNew,
    );
    // Fire-and-forget orphan deletion: failure must not block the save.
    deleteOrphanedImages(orphanedUrls).catch((err) =>
      console.error('[SUPPLY] Orphan image cleanup failed:', err),
    );
    nextImageUrls = finalUrls;
    nextImageUrl = finalUrls[0] ?? defaultOfferImageUrl();
    nextImageCrops = reconcileImageCrops(
      finalUrls,
      allNew,
      input.keptImageCrops ?? currentOffer.imageCrops,
      allNewCrops,
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
        // Validity VALUE is per inventory unit; the legacy parent mirror stays null.
        // The validity TYPE default is applied from input when sent.
        voucherValidityValue: null,
        voucherValidityUnit: null,
        ...(input.defaultValidityType !== undefined && { defaultValidityType: input.defaultValidityType }),
        ...(input.voucherStackable !== undefined && { voucherStackable: input.voucherStackable }),
        ...(input.voucherBackgroundColor !== undefined && { voucherBackgroundColor: input.voucherBackgroundColor }),
        ...(input.sku !== undefined && { sku: input.sku }),
        ...(input.maxPayments !== undefined && { maxPayments: resolveVoucherMaxPayments(true, input.maxPayments) }),
      }
    : {
        ...(input.validFrom !== undefined && { validFrom: input.validFrom }),
        ...(input.validUntil !== undefined && { validUntil: input.validUntil }),
        voucherValidityValue: null,
        voucherValidityUnit: null,
        defaultValidityType: null,
        voucherStackable: null,
        voucherBackgroundColor: null,
        sku: null,
        maxPayments: null,
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
  // Variant ids whose sale price (nexus_cost) changed in this edit. Used after the
  // write to re-sync per-tenant price overrides so the displayed Sale Price snaps
  // to the new value (tenant_only) - see the post-update block below.
  const nexusChangedVids = new Set<string>();
  if (isVoucherUpdate && input.variants !== undefined) {
    const built = buildVoucherVariants(input.variants, {
      face_value: input.face_value ?? currentOffer.face_value,
      nexus_cost: input.nexus_cost ?? currentOffer.nexus_cost,
      member_price: input.member_price ?? currentOffer.member_price,
      voucherStackable: input.voucherStackable,
      sku: input.sku,
      tags: input.tags,
      terms: input.terms,
      implementationInstructions: input.implementationInstructions,
    }, currentOffer.nexusFeePct ?? NEXUS_FEE_DEFAULT_PCT);
    // Detect which variants had their sale price (nexus_cost) changed. A brand-new
    // variant (no stored match) counts as changed.
    const storedForPricing = new Map((currentOffer.variants ?? []).map((v) => [v.variantId, v]));
    for (const v of built) {
      const prev = storedForPricing.get(v.variantId);
      if (!prev || prev.nexus_cost !== v.nexus_cost) nexusChangedVids.add(v.variantId);
    }
    variantSet = { variants: built };
    variantMirror = mirrorRepresentativeOntoOffer(built);
    variantDisplayPrice = computeDisplayPrice('voucher', lowestMemberPrice(built), mergedMarketPrice);
  }
  if (isVoucherUpdate && input.redemptionScope !== undefined) {
    variantSet.redemptionScope = input.redemptionScope;
  }

  // Resubmit target: a trusted tenant's re-submitted (previously denied) offer goes
  // straight back to 'active'; otherwise it re-enters the approval queue.
  const resubmitStatus = wasResubmitted
    ? ((await isTenantAutoApprove(tenantId)) ? 'active' : 'pending_approval')
    : undefined;

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
    ...(input.branchListUrl !== undefined && { branchListUrl: input.branchListUrl }),
    // Branch list is voucher-only - force null when the merged type is not a voucher.
    ...(!isVoucherUpdate && { branchListUrl: null }),
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
    // Platform-admin visibility change: set the new visibility, publish it live
    // (admin approves), and for tenant_only pin invitedByTenantId to the owner so
    // only that tenant sees it. Placed before the resubmit spread so a denied
    // offer's resubmit status still wins if both apply.
    ...(visibilityChange && {
      visibility: input.visibility,
      status: 'active' as const,
      statusChangedAt: now,
      denial_reason: '',
    }),
    // Re-stamp ownership to the new tenant + its owner identity.
    ...(ownerChange && {
      createdByTenantId: input.ownerTenantId,
      ...(input.ownerIdentityId ? { createdByIdentityId: input.ownerIdentityId } : {}),
    }),
    // tenant_only scope pins invitedByTenantId to the (effective) owner. Recompute
    // whenever visibility OR owner changed so it always tracks the current owner;
    // ecosystem needs no value (the ecosystem read clause ignores this field).
    ...((visibilityChange || ownerChange) && effectiveVisibility === 'tenant_only'
      && { invitedByTenantId: effectiveOwner }),
    // Resubmit: clear denial and move to the resubmit target status (queue, or
    // live for a trusted tenant).
    ...(wasResubmitted && { status: resubmitStatus, denial_reason: '' }),
    // Stamp the fee intent on voucher offers that predate the field (the bake
    // above already used the default), so reads + the admin slider see it.
    ...(isVoucherUpdate && currentOffer.nexusFeePct === undefined && { nexusFeePct: NEXUS_FEE_DEFAULT_PCT }),
    // Variant mirror + array win over the flat spreads above (voucher edit only).
    ...variantMirror,
    ...variantSet,
    ...(variantDisplayPrice !== undefined && { displayPrice: variantDisplayPrice }),
    // Derived search fields recompute from the MERGED state (existing + patch):
    // descriptionText only when the description changed; the base cashback
    // range ALWAYS (cheap, idempotent - variant/price edits must never leave
    // the stored range stale).
    ...offerSearchWriteFields({
      description: input.description,
      variants: variantSet.variants ?? currentOffer.variants,
      flatFaceValue: input.face_value ?? currentOffer.face_value,
      flatMemberPrice: mergedMemberPrice,
    }),
  };

  const result = await nexusOffers.findOneAndUpdate(
    // Same ownership scope as the load above (admins: any offer; tenants: own,
    // non-on-behalf). Deleted offers excluded so an edit can never resurrect one.
    ownerFilter,
    { $set: update },
    { returnDocument: 'after' }
  );

  if (!result) return null;

  // On owner reassignment, remove the offer from the ORIGINAL tenant: drop its
  // adoption / per-tenant pricing record so the offer disappears from the old
  // owner's catalog (own-offers list already follows the new createdByTenantId).
  // Best-effort: never fails the save.
  if (ownerChange) {
    try {
      await tenantOfferConfigs.deleteMany({ offerId, tenantId: currentOffer.createdByTenantId });
    } catch (err) {
      console.error('[SUPPLY] Old-owner config cleanup on reassignment failed:', err);
    }
  }

  // Admin-offer auto-adopt: an admin flipping an ON-BEHALF offer (marked by
  // uploadedByIdentityId) to ecosystem publishes it live, so fan it out to all
  // eligible tenants' catalogs - same behavior as an on-behalf ecosystem
  // create. Regular tenant offers (no uploadedByIdentityId) never auto-adopt.
  // Best-effort: never fails the save.
  if (visibilityChange && input.visibility === 'ecosystem' && result.uploadedByIdentityId) {
    try {
      await autoAdoptOfferForAllTenants(offerId);
    } catch (err) {
      console.error('[SUPPLY] Admin-offer auto-adopt fan-out failed:', err);
    }
  }

  // After a deal-pricing edit on a voucher, re-sync per-tenant price overrides
  // (TenantOfferConfig.variantPrices + legacy offer-level memberPrice) so the
  // displayed Sale Price stays correct. Behavior depends on who edited:
  //   - tenant_only: the owning tenant edited ITS OWN sale price, so the displayed
  //     price must SNAP to the new value - drop the override for each changed
  //     variant (display falls back to the freshly-reseeded base member_price).
  //   - ecosystem: preserve each adopter's margin, only clamp any override back
  //     into the new [0, face_value] window.
  // Best-effort: never fails the save.
  if (isVoucherUpdate && variantSet.variants !== undefined) {
    try {
      if (currentOffer.visibility === 'tenant_only') {
        await resetTenantPricesForChangedVariants(offerId, variantSet.variants, nexusChangedVids);
      } else {
        await clampTenantVariantPricesToBounds(offerId, variantSet.variants);
      }
    } catch (err) {
      console.error('[SUPPLY] Tenant member-price re-sync failed:', err);
    }
  }

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
  // A tenant may NOT delete an offer a Nexus admin uploaded on its behalf
  // (uploadedByIdentityId set) - Nexus manages those. Already-deleted offers are
  // excluded so a repeat delete returns 404 cleanly.
  const ownerFilter = isPlatformAdmin
    ? { offerId, ...NOT_DELETED }
    : { offerId, createdByTenantId: tenantId, uploadedByIdentityId: { $exists: false }, ...NOT_DELETED };

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

  // Cascade - hard-delete this offer's voucher inventory (barcodes/links). Barcode
  // values are GLOBALLY unique (partial unique index), so leaving them behind would
  // block ever reusing that barcode. The offer doc is soft-deleted for history, but
  // its inventory has no such need and must free the unique values.
  await getVoucherCodeCollection(db).deleteMany({ offerId });

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
