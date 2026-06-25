/**
 * Integration tests for the unit-level dating behavior of voucher-inventory.service:
 * per-batch validity is stamped onto every created unit (limit leaves the window
 * empty; from_until stores it), listVariantUnits filters by date + pages,
 * updateUnitValidity mutates only validity (and preserves the other set, lossless
 * flip), and deleteUnit removes a unit. Uses the in-memory Mongo from tests/setup.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let db: Db;
// The service reaches Mongo via getMongoDb(); point it at the in-memory test db.
vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import {
  addBarcodes,
  listVariantUnits,
  updateUnitValidity,
  deleteUnit,
} from '../../src/services/voucher-inventory.service';
import { getVoucherCodeCollection } from '../../src/models/domain/voucher-codes.models';

let client: MongoClient;
const OFFER = 'offer_1';
const VARIANT = 'var_test1';

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_inv_dating_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await getVoucherCodeCollection(db).deleteMany({});
});

describe('addBarcodes stamps per-batch validity', () => {
  it('limit batch stores the duration and leaves the window empty', async () => {
    await addBarcodes(OFFER, VARIANT, ['A1', 'A2'], { validityValue: 5, validityUnit: 'years' });
    const units = await getVoucherCodeCollection(db).find({ offerId: OFFER }).toArray();
    expect(units).toHaveLength(2);
    for (const u of units) {
      expect(u.validityValue).toBe(5);
      expect(u.validityUnit).toBe('years');
      expect(u.validFrom ?? null).toBeNull();
      expect(u.validUntil ?? null).toBeNull();
    }
  });

  it('from_until batch stores the window on every unit', async () => {
    const from = new Date('2026-01-01');
    const until = new Date('2031-01-01');
    await addBarcodes(OFFER, VARIANT, ['B1', 'B2', 'B3'], { validFrom: from, validUntil: until });
    const units = await getVoucherCodeCollection(db).find({ offerId: OFFER }).toArray();
    expect(units).toHaveLength(3);
    for (const u of units) {
      expect(u.validFrom).toEqual(from);
      expect(u.validUntil).toEqual(until);
      expect(u.validityValue ?? null).toBeNull();
    }
  });
});

describe('listVariantUnits filters + pages', () => {
  beforeEach(async () => {
    await addBarcodes(OFFER, VARIANT, ['W1'], { validFrom: new Date('2026-01-01'), validUntil: new Date('2026-06-01') });
    await addBarcodes(OFFER, VARIANT, ['W2'], { validFrom: new Date('2026-01-01'), validUntil: new Date('2031-01-01') });
    await addBarcodes(OFFER, VARIANT, ['N1'], { validityValue: 2, validityUnit: 'years' }); // no window yet
  });

  it('returns all units with a total', async () => {
    const page = await listVariantUnits(OFFER, VARIANT, {}, 1, 50);
    expect(page.total).toBe(3);
    expect(page.units).toHaveLength(3);
  });

  it('filters by until (window ending on/before a date)', async () => {
    const page = await listVariantUnits(OFFER, VARIANT, { until: new Date('2027-01-01') }, 1, 50);
    expect(page.units.map((u) => u.value)).toEqual(['W1']);
  });

  it('filters expiring-soon by a fixed window from now', async () => {
    const now = new Date('2026-05-01');
    const page = await listVariantUnits(OFFER, VARIANT, { expiringWithin: '3m' }, 1, 50, now);
    // Only W1 (until 2026-06-01) is within 3 months of 2026-05-01.
    expect(page.units.map((u) => u.value)).toEqual(['W1']);
  });

  it('filters the no-window group (unsold limit units)', async () => {
    const page = await listVariantUnits(OFFER, VARIANT, { noWindow: true }, 1, 50);
    expect(page.units.map((u) => u.value)).toEqual(['N1']);
  });

  it('pages results', async () => {
    const p1 = await listVariantUnits(OFFER, VARIANT, {}, 1, 2);
    const p2 = await listVariantUnits(OFFER, VARIANT, {}, 2, 2);
    expect(p1.units).toHaveLength(2);
    expect(p2.units).toHaveLength(1);
    expect(p1.total).toBe(3);
  });
});

describe('updateUnitValidity is lossless + delete', () => {
  it('sets the new type validity while preserving the other set', async () => {
    await addBarcodes(OFFER, VARIANT, ['F1'], { validFrom: new Date('2026-01-01'), validUntil: new Date('2031-01-01') });
    const [unit] = await getVoucherCodeCollection(db).find({ offerId: OFFER }).toArray();
    // Flip to limit: set the duration; the from/until are preserved (lossless).
    const updated = await updateUnitValidity(OFFER, VARIANT, unit.codeId, { validityValue: 3, validityUnit: 'years' });
    expect(updated?.validityValue).toBe(3);
    expect(updated?.validFrom).toBe(new Date('2026-01-01').toISOString());
  });

  it('returns null for an unknown unit', async () => {
    const r = await updateUnitValidity(OFFER, VARIANT, 'nope', { validityValue: 1, validityUnit: 'days' });
    expect(r).toBeNull();
  });

  it('deletes a unit and reports it', async () => {
    await addBarcodes(OFFER, VARIANT, ['D1'], { validityValue: 1, validityUnit: 'years' });
    const [unit] = await getVoucherCodeCollection(db).find({ offerId: OFFER }).toArray();
    const res = await deleteUnit(OFFER, VARIANT, unit.codeId);
    expect(res.deleted).toBe(true);
    expect(await getVoucherCodeCollection(db).countDocuments({ offerId: OFFER })).toBe(0);
  });
});
