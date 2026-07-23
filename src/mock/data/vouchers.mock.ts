/**
 * Mock voucher data for the SPAR gift-flow hero - a trimmed 1:1 slice of
 * nexus-wallet's src/mock/data/vouchers.mock.ts. Only the SPAR gift entry
 * (voucher `v_spar_gift` + user voucher `uv_spar_gift`) that HeroGiftFlow
 * redeems into is kept; field values match the wallet exactly so the ported
 * VoucherCard renders identically.
 */
import type { Voucher, UserVoucher } from '../../types/voucher.types';

const sparVoucher: Voucher = {
  id: 'v_spar_gift', title: 'SPAR Gift Card', titleHe: 'גיפט קארד SPAR',
  description: '₪150 SPAR gift card, redeemable across the chain', descriptionHe: 'גיפט קארד SPAR בשווי ₪150, למימוש בכל סניפי הרשת',
  merchantName: 'SPAR', merchantLogo: '🛒', category: 'food',
  originalPrice: 150, discountedPrice: 0, discountPercent: 0, currency: 'ILS',
  image: '🛒', imageUrl: '/gift-cards/spar.png', validUntil: '2026-12-31',
  termsAndConditions: 'Redeemable at all SPAR branches.', termsAndConditionsHe: 'למימוש בכל סניפי SPAR.',
  // The card *is* the SPAR artwork - full-bleed, logo kept by anchoring left.
  brandColor: '#0f6b34', brandLogo: '/tenants/spar-logo.svg',
  cardImage: '/gift-cards/spar.png', cardImagePosition: 'left center',
  inStock: true, popular: false,
};

export const mockUserVouchers: UserVoucher[] = [
  {
    // SPAR gift - the card the gift-sample flow redeems into for tenant=spar.
    id: 'uv_spar_gift', voucherId: 'v_spar_gift',
    voucher: sparVoucher,
    purchasedAt: '2026-06-12T08:00:00Z', expiresAt: '2026-12-31T23:59:59Z',
    status: 'active', redemptionCode: 'NXS-SPR-7140',
    qrCode: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=NXS-SPR-7140',
  },
];
