/**
 * formatCurrency - ported 1:1 from nexus-wallet. Formats a number as a
 * localized currency string (defaults to ILS / he-IL). Used by the ported
 * VoucherCard to render the gift-card balance.
 */
export function formatCurrency(amount: number, currency: string = 'ILS', locale: string = 'he-IL'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
