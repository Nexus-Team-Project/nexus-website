/**
 * Leaf constants for voucher offer VARIANTS. Kept import-free of `supply.models`
 * to avoid a circular dependency (the variant Zod schema, which needs the voucher
 * validity/SKU primitives, is co-located in `supply.models.ts` instead).
 *
 * A voucher offer (executionType === 'voucher') is a PARENT that holds one or
 * more variants. The parent keeps the global fields (title, image/color,
 * description, category); each variant carries its own price, purchase-anchored
 * validity, combine-with-promotions choice, SKU, tags, and - when the parent's
 * redemptionScope is 'per_variant' - its own redemption terms/method.
 *
 * Variants are EMBEDDED on the offer document as `variants: OfferVariant[]`. They
 * are the internal `Variant` already named in the platform contract ("subOffers =
 * internal Variant; subOfferId = variant_id") - NO separate public "SubOffer"
 * entity and no new collection. Redeemable inventory is NOT embedded; it lives
 * one-doc-per-unit in `voucherCodes`, bound to a variant via `variantId`.
 */

/**
 * Whether redemption terms (תנאי מימוש) and method (אופן מימוש) are authored
 * once on the parent ('shared') or per variant ('per_variant'). A single toggle
 * controls BOTH fields together - they never split across levels.
 */
export const OFFER_REDEMPTION_SCOPES = ['shared', 'per_variant'] as const;
export type OfferRedemptionScope = typeof OFFER_REDEMPTION_SCOPES[number];

/**
 * Soft upper bound on variants per offer. Guards the UI and the embedded-array
 * document size (each variant is small, so this is far below Mongo's 16 MB cap).
 */
export const MAX_VARIANTS_PER_OFFER = 20;

/** Server-generated variant id format: `var_` + lowercase base36. */
export const VARIANT_ID_REGEX = /^var_[a-z0-9]+$/;
