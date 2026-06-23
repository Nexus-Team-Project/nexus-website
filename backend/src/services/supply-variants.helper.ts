/**
 * Helpers for voucher offer VARIANTS: id generation, choosing the representative
 * variant, mirroring it onto the offer's legacy top-level fields, and detecting
 * duplicate variants.
 *
 * Variants are embedded on the offer (`NexusOffer.variants`). The "representative"
 * variant is the one with the lowest member_price; its price/validity/stackable/
 * sku/tags are mirrored onto the offer's top-level fields so legacy read sites and
 * the denormalized `displayPrice` keep working without per-site rewrites (the same
 * pattern as `imageUrl` <- `imageUrls[0]`).
 */
import { randomBytes } from 'node:crypto';
import { createError } from '../middleware/errorHandler';
import type { NexusOffer, OfferVariant } from '../models/domain/supply.models';
import { VARIANT_ID_REGEX, MAX_VARIANTS_PER_OFFER } from '../models/domain/supply-variants.models';
import type { OfferVoucherValidityUnit } from '../models/domain/supply.models';

/**
 * A variant as received from a client (create/update). `variantId` is optional:
 * present to preserve an existing variant on edit, absent for a brand-new one
 * (the service generates one). All other fields mirror OfferVariant.
 */
export interface OfferVariantInput {
  variantId?: string;
  face_value?: number;
  nexus_cost?: number;
  member_price?: number;
  voucherValidityValue?: number | null;
  voucherValidityUnit?: OfferVoucherValidityUnit | null;
  voucherStackable?: boolean | null;
  sku?: string | null;
  tags?: string[];
  terms?: string;
  implementationInstructions?: string;
}

/**
 * Flat single-variant fields used to synthesize a one-variant array when a
 * client has not (yet) sent a `variants` array - keeps the backend working with
 * the pre-variant frontend.
 */
export interface FlatVoucherFields {
  face_value?: number;
  nexus_cost?: number;
  member_price?: number;
  voucherValidityValue?: number | null;
  voucherValidityUnit?: OfferVoucherValidityUnit | null;
  voucherStackable?: boolean | null;
  sku?: string | null;
  tags?: string[];
  terms?: string;
  implementationInstructions?: string;
}

/**
 * Generates a new variant id (`var_` + 12 lowercase base36 chars).
 * Input: none. Output: a string matching VARIANT_ID_REGEX.
 */
export function generateVariantId(): string {
  // 9 random bytes -> base36 gives ~14 chars; slice to a stable 12-char tail.
  const raw = randomBytes(9).toString('hex');
  const base36 = BigInt(`0x${raw}`).toString(36);
  return `var_${base36.padStart(12, '0').slice(-12)}`;
}

/**
 * Returns the representative variant - the one with the lowest defined
 * member_price (ties resolved by array order). Variants without a member_price
 * sort last so a priced variant is always preferred.
 *
 * Input:  variants - the offer's variant array (may be empty/undefined).
 * Output: the representative OfferVariant, or undefined when there are none.
 */
export function representativeVariant(
  variants: OfferVariant[] | undefined,
): OfferVariant | undefined {
  if (!variants || variants.length === 0) return undefined;
  return variants.reduce((best, v) => {
    const bp = best.member_price ?? Number.POSITIVE_INFINITY;
    const vp = v.member_price ?? Number.POSITIVE_INFINITY;
    return vp < bp ? v : best;
  });
}

/**
 * The legacy top-level offer fields driven by the representative variant. Spread
 * onto the offer document (create) or into the $set update (edit) so untouched
 * read sites keep working.
 *
 * Input:  variants - the offer's variant array.
 * Output: a partial NexusOffer with the mirrored fields, or null fields when
 *         there is no representative variant (non-voucher / unmigrated).
 */
export function mirrorRepresentativeOntoOffer(
  variants: OfferVariant[] | undefined,
): Partial<NexusOffer> {
  const rep = representativeVariant(variants);
  if (!rep) return {};
  return {
    face_value: rep.face_value,
    nexus_cost: rep.nexus_cost,
    member_price: rep.member_price,
    voucherValidityValue: rep.voucherValidityValue ?? null,
    voucherValidityUnit: rep.voucherValidityUnit ?? null,
    voucherStackable: rep.voucherStackable ?? null,
    sku: rep.sku ?? null,
    tags: rep.tags ?? [],
  };
}

/**
 * Builds a deterministic signature of a variant's CONFIGURABLE values - the
 * shared definition of "identical" used by both the UI and the API to reject
 * duplicate variants on the same parent. Two variants with the same signature
 * are functionally the same variant.
 *
 * Input:  v - a variant.
 * Output: a stable string key over face/nexus/member price, validity amount +
 *         unit, stackable, normalized SKU, and (when present) redemption
 *         terms/method.
 */
export function variantSignature(v: OfferVariant): string {
  return JSON.stringify([
    v.face_value ?? null,
    v.nexus_cost ?? null,
    v.member_price ?? null,
    v.voucherValidityValue ?? null,
    v.voucherValidityUnit ?? null,
    v.voucherStackable ?? null,
    (v.sku ?? '').trim().toUpperCase() || null,
    (v.terms ?? '').trim() || null,
    (v.implementationInstructions ?? '').trim() || null,
  ]);
}

/**
 * Returns true when the variant set contains two or more variants with the same
 * signature (i.e. a duplicate). Used to reject duplicates server-side.
 *
 * Input:  variants - the full variant array being saved.
 * Output: true when a duplicate exists.
 */
export function hasDuplicateVariants(variants: OfferVariant[]): boolean {
  const seen = new Set<string>();
  for (const v of variants) {
    const sig = variantSignature(v);
    if (seen.has(sig)) return true;
    seen.add(sig);
  }
  return false;
}

/**
 * Finalizes a client variant input into a persisted OfferVariant: keeps a valid
 * incoming `variantId` (edit) or generates one (new); defaults member_price to
 * nexus_cost when omitted (matches the offer-level voucher rule); strips
 * undefined fields. Does NOT validate pricing bounds - the route does that.
 */
function finalizeVariant(v: OfferVariantInput): OfferVariant {
  const member = v.member_price === undefined ? v.nexus_cost : v.member_price;
  return {
    variantId: v.variantId && VARIANT_ID_REGEX.test(v.variantId) ? v.variantId : generateVariantId(),
    ...(v.face_value !== undefined && { face_value: v.face_value }),
    ...(v.nexus_cost !== undefined && { nexus_cost: v.nexus_cost }),
    ...(member !== undefined && { member_price: member }),
    voucherValidityValue: v.voucherValidityValue ?? null,
    voucherValidityUnit: v.voucherValidityUnit ?? null,
    voucherStackable: v.voucherStackable ?? null,
    sku: v.sku ?? null,
    tags: v.tags ?? [],
    ...(v.terms !== undefined && { terms: v.terms }),
    ...(v.implementationInstructions !== undefined && { implementationInstructions: v.implementationInstructions }),
  };
}

/**
 * Builds the final variant array for a voucher offer. When the client sent a
 * `variants` array it is finalized as-is; otherwise a single variant is
 * synthesized from the flat fields (backward-compat with the pre-variant form).
 * Guarantees at least one variant.
 *
 * Input:  variants (optional client array) + flat fallback fields.
 * Output: a non-empty OfferVariant[].
 * Throws: 400 when more than MAX_VARIANTS_PER_OFFER are supplied or duplicates exist.
 */
export function buildVoucherVariants(
  variants: OfferVariantInput[] | undefined,
  flat: FlatVoucherFields,
): OfferVariant[] {
  const raw: OfferVariantInput[] = variants && variants.length > 0 ? variants : [flat];
  if (raw.length > MAX_VARIANTS_PER_OFFER) {
    throw createError(`A voucher offer may have at most ${MAX_VARIANTS_PER_OFFER} variants.`, 400);
  }
  const finalized = raw.map(finalizeVariant);
  if (hasDuplicateVariants(finalized)) {
    throw createError('Duplicate variant: two variants have identical values.', 400);
  }
  return finalized;
}

/** Lowest defined member_price across variants (the catalog "from" / sort price). */
export function lowestMemberPrice(variants: OfferVariant[] | undefined): number | undefined {
  const rep = representativeVariant(variants);
  return rep?.member_price;
}
