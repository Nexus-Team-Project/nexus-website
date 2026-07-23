/**
 * Voucher domain types - ported 1:1 from nexus-wallet (src/types/voucher.types.ts).
 * Only the pieces the ported SPAR gift flow needs (Voucher + UserVoucher) are
 * kept; the wider store/variant/filter model is out of scope for the hero.
 */
export type VoucherCategory = 'food' | 'shopping' | 'entertainment' | 'travel' | 'health' | 'education' | 'tech';

export interface Voucher {
  id: string;
  title: string;
  titleHe: string;
  description: string;
  descriptionHe: string;
  merchantName: string;
  merchantLogo: string;
  category: VoucherCategory;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  currency: string;
  image: string;
  imageUrl?: string;
  validUntil: string;
  termsAndConditions: string;
  termsAndConditionsHe: string;
  brandColor?: string;
  brandLogo?: string;
  /**
   * Full-bleed card artwork. When set, the wallet card face renders this
   * image edge-to-edge (object-cover) instead of the brandColor + centred
   * brandLogo composition - used for gift cards whose card *is* the artwork.
   */
  cardImage?: string;
  /** object-position for `cardImage` (e.g. 'left center' to keep a corner logo). */
  cardImagePosition?: string;
  /**
   * Payment-network mark shown on the card face. When set, the card renders
   * the network logo where the Nexus mark normally sits and moves the Nexus
   * mark to the top corner (e.g. the Menora claim card on Mastercard).
   */
  paymentNetwork?: 'mastercard' | 'visa';
  inStock: boolean;
  popular: boolean;
  isOnline?: boolean;
  isNew?: boolean;
  comingSoon?: boolean;
}

export interface UserVoucher {
  id: string;
  voucherId: string;
  voucher: Voucher;
  purchasedAt: string;
  expiresAt: string;
  status: 'active' | 'used' | 'expired';
  redemptionCode: string;
  qrCode: string;
  usedAt?: string;
}
