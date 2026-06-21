/**
 * Unit tests for the pure bulk-voucher row validator/mapper. No DB/network —
 * covers visibility resolution, the barcodes-XOR-links inventory rule, link
 * parsing/validation, and the core field validations.
 */
import { describe, it, expect } from 'vitest';
import { validateAndMapRow, type BulkVoucherRawRow } from '../../src/services/voucher-bulk.service';

const ctx = { tenantId: 't1', identityId: 'i1', isPlatformAdmin: false, businessSetupComplete: true };

/** A minimal valid row; override fields per test. */
const row = (over: Partial<BulkVoucherRawRow> = {}): BulkVoucherRawRow => ({
  title: 'Spa day',
  face_value: '200',
  nexus_cost: '150',
  combinable: 'yes',
  ...over,
});

describe('validateAndMapRow — basics', () => {
  it('maps a minimal valid row and defaults visibility to tenant_only', () => {
    const r = validateAndMapRow(row(), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.visibility).toBe('tenant_only');
      expect(r.input.executionType).toBe('voucher');
      expect(r.input.voucherStackable).toBe(true);
      expect(r.input.face_value).toBe(200);
      expect(r.input.nexus_cost).toBe(150);
      expect(r.inventory).toBeNull();
    }
  });

  it('rejects nexus_cost >= face_value', () => {
    const r = validateAndMapRow(row({ nexus_cost: '250' }), ctx);
    expect(r.ok).toBe(false);
  });

  it('rejects a missing title', () => {
    const r = validateAndMapRow(row({ title: '' }), ctx);
    expect(r.ok).toBe(false);
  });

  it('rejects an unrecognized combinable value', () => {
    const r = validateAndMapRow(row({ combinable: 'maybe' }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/combinable/i);
  });

  it('parses combinable no → false', () => {
    const r = validateAndMapRow(row({ combinable: 'no' }), ctx);
    expect(r.ok && r.input.voucherStackable).toBe(false);
  });
});

describe('validateAndMapRow — visibility', () => {
  it('allows ecosystem when business setup is complete', () => {
    const r = validateAndMapRow(row({ visibility: 'ecosystem' }), { ...ctx, businessSetupComplete: true });
    expect(r.ok && r.input.visibility).toBe('ecosystem');
  });

  it('blocks ecosystem when business setup is incomplete', () => {
    const r = validateAndMapRow(row({ visibility: 'ecosystem' }), { ...ctx, businessSetupComplete: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/business setup/i);
  });
});

describe('validateAndMapRow — inventory (barcodes XOR links)', () => {
  it('maps barcodeQuantity to barcode inventory', () => {
    const r = validateAndMapRow(row({ barcodeQuantity: '100' }), ctx);
    expect(r.ok && r.inventory).toEqual({ kind: 'barcode', quantity: 100 });
  });

  it('maps a pipe-separated links cell to link inventory (deduped)', () => {
    const r = validateAndMapRow(row({ links: 'https://a/1 | https://a/2 | https://a/1' }), ctx);
    expect(r.ok && r.inventory).toEqual({ kind: 'link', links: ['https://a/1', 'https://a/2'] });
  });

  it('rejects a row that sets BOTH barcodeQuantity and links', () => {
    const r = validateAndMapRow(row({ barcodeQuantity: '10', links: 'https://a/1' }), ctx);
    expect(r.ok).toBe(false);
  });

  it('rejects a links cell with a non-http(s) / free-text entry', () => {
    const r = validateAndMapRow(row({ links: 'https://a/1 | not-a-url' }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/http/i);
  });

  it('leaves inventory null when neither column is set', () => {
    const r = validateAndMapRow(row(), ctx);
    expect(r.ok && r.inventory).toBeNull();
  });
});

describe('validateAndMapRow — optional fields', () => {
  it('rejects an invalid SKU and accepts a valid one', () => {
    expect(validateAndMapRow(row({ sku: 'lower-case' }), ctx).ok).toBe(false);
    expect(validateAndMapRow(row({ sku: 'GIFT_100' }), ctx).ok).toBe(true);
  });

  it('rejects an invalid hex background color', () => {
    expect(validateAndMapRow(row({ backgroundColor: 'blue' }), ctx).ok).toBe(false);
    expect(validateAndMapRow(row({ backgroundColor: '#635bff' }), ctx).ok).toBe(true);
  });

  it('requires validity value + unit together', () => {
    expect(validateAndMapRow(row({ validityValue: '2' }), ctx).ok).toBe(false);
    const r = validateAndMapRow(row({ validityValue: '2', validityUnit: 'years' }), ctx);
    expect(r.ok && r.input.voucherValidityValue).toBe(2);
  });

  it('rejects an unknown category and defaults blank to other', () => {
    expect(validateAndMapRow(row({ category: 'spaceships' }), ctx).ok).toBe(false);
    const r = validateAndMapRow(row(), ctx);
    expect(r.ok && r.input.category).toBe('other');
  });

  it('splits tags on semicolons', () => {
    const r = validateAndMapRow(row({ tags: 'spa; wellness ; gift' }), ctx);
    expect(r.ok && r.input.tags).toEqual(['spa', 'wellness', 'gift']);
  });

  it('carries imageUrl through as rawImageUrl for the orchestrator', () => {
    const r = validateAndMapRow(row({ imageUrl: 'https://img/x.jpg' }), ctx);
    expect(r.ok && r.rawImageUrl).toBe('https://img/x.jpg');
  });
});
