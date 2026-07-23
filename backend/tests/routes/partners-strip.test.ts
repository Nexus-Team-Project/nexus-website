/**
 * Unit test for the guest field-stripping on /api/partners: discount AND
 * cashbackPct must both be removed for unauthenticated callers.
 */
import { describe, expect, it } from 'vitest';
import { stripGuestPartnerFields } from '../../src/routes/partners.route';

describe('stripGuestPartnerFields', () => {
  it('removes discount and cashbackPct, keeps everything else', () => {
    const partner = {
      id: 'p1',
      title: 'Nike',
      discount: '20% הנחה',
      cashbackPct: 20,
      categories: ['ביגוד'],
    };
    const publicView = stripGuestPartnerFields(partner);
    expect(publicView).toEqual({ id: 'p1', title: 'Nike', categories: ['ביגוד'] });
    expect('discount' in publicView).toBe(false);
    expect('cashbackPct' in publicView).toBe(false);
  });
});
