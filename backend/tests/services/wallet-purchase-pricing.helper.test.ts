/**
 * Tests for the wallet purchase pricing helper: the buyer is CHARGED the
 * variant's full FACE VALUE, and the gap down to the DISPLAYED sale price
 * (per-tenant override for adopters, base member_price on the Nexus
 * ecosystem catalog) is returned as cashbackAgorot - and the
 * access/purchasability gates must hold.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.3
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

vi.mock('../../src/config/mongo', () => ({ getMongoDb: vi.fn(async () => db) }));

import { resolvePurchaseOffer } from '../../src/services/wallet/purchase-pricing.helper';
import { DOMAIN_COLLECTIONS } from '../../src/models/domain/collections';

const IDENTITY = 'id_member';
const TENANT = 't1';
const OFFER = 'offer1';

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`wallet_purchase_pricing_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  for (const c of [
    DOMAIN_COLLECTIONS.nexusOffers,
    DOMAIN_COLLECTIONS.tenantOfferConfigs,
    DOMAIN_COLLECTIONS.tenantServiceActivations,
    DOMAIN_COLLECTIONS.tenantMembers,
  ]) {
    await db.collection(c).deleteMany({});
  }
  await db.collection(DOMAIN_COLLECTIONS.nexusOffers).insertOne({
    offerId: OFFER,
    title: 'Coffee voucher',
    executionType: 'voucher',
    status: 'active',
    visibility: 'ecosystem',
    deletedAt: null,
    createdByTenantId: 't_creator',
    variants: [
      { variantId: 'v1', face_value: 100, member_price: 90 },
      { variantId: 'v2', face_value: 200, member_price: 180 },
    ],
  });
  await db.collection(DOMAIN_COLLECTIONS.tenantOfferConfigs).insertOne({
    tenantId: TENANT,
    offerId: OFFER,
    adoptionStatus: 'active',
    variantPrices: { v1: 95 },
  });
  await db.collection(DOMAIN_COLLECTIONS.tenantServiceActivations).insertOne({
    tenantId: TENANT,
    serviceKey: 'benefits_catalog',
    status: 'active',
  });
  await db.collection(DOMAIN_COLLECTIONS.tenantMembers).insertOne({
    tenantId: TENANT,
    nexusIdentityId: IDENTITY,
    status: 'active',
  });
});

describe('resolvePurchaseOffer', () => {
  it('tenant context: charges face value; cashback = face minus adopter override', async () => {
    const res = await resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v1', tenantId: TENANT,
    });
    expect(res.priceAgorot).toBe(10000); // face value 100 shekels charged
    expect(res.cashbackAgorot).toBe(500); // 100 - override 95
    expect(res.tenantId).toBe(TENANT);
    expect(res.offerTitle).toBe('Coffee voucher');
  });

  it('tenant context: variant without override - cashback from base member_price', async () => {
    const res = await resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v2', tenantId: TENANT,
    });
    expect(res.priceAgorot).toBe(20000); // face value 200 charged
    expect(res.cashbackAgorot).toBe(2000); // 200 - base 180
  });

  it('null tenant (Nexus catalog): face value charged, cashback from base price', async () => {
    const res = await resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v1', tenantId: null,
    });
    expect(res.priceAgorot).toBe(10000); // face value charged
    expect(res.cashbackAgorot).toBe(1000); // 100 - base 90, override ignored
    expect(res.tenantId).toBeNull();
  });

  it('variant without a face value falls back to the sale price with zero cashback', async () => {
    await db.collection(DOMAIN_COLLECTIONS.nexusOffers).updateOne(
      { offerId: OFFER },
      { $set: { variants: [{ variantId: 'v1', member_price: 90 }] } },
    );
    const res = await resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v1', tenantId: null,
    });
    expect(res.priceAgorot).toBe(9000);
    expect(res.cashbackAgorot).toBe(0);
    expect(res.faceValueAgorot).toBeNull();
  });

  it('rejects a non-member of the tenant with no_catalog_access', async () => {
    await expect(resolvePurchaseOffer(db, {
      identityId: 'stranger', offerId: OFFER, variantId: 'v1', tenantId: TENANT,
    })).rejects.toThrow('no_catalog_access');
  });

  it('rejects a tenant that never adopted the offer with not_purchasable', async () => {
    await db.collection(DOMAIN_COLLECTIONS.tenantOfferConfigs).deleteMany({});
    await expect(resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v1', tenantId: TENANT,
    })).rejects.toThrow('not_purchasable');
  });

  it('rejects inactive offers, unknown offers and unknown variants', async () => {
    await expect(resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: 'nope', variantId: 'v1', tenantId: null,
    })).rejects.toThrow('offer_not_found');

    await expect(resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v9', tenantId: null,
    })).rejects.toThrow('variant_not_found');

    await db.collection(DOMAIN_COLLECTIONS.nexusOffers).updateOne(
      { offerId: OFFER }, { $set: { status: 'disabled' } },
    );
    await expect(resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v1', tenantId: null,
    })).rejects.toThrow('not_purchasable');
  });
});
