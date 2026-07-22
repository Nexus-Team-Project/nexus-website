/**
 * Tests for the wallet purchase pricing helper: the server-resolved price the
 * buyer is charged must equal the price the wallet DISPLAYS - per-tenant
 * override for adopters, base member_price on the Nexus (ecosystem) catalog -
 * and access/purchasability gates must hold.
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
  it('tenant context: adopter override price wins, converted to agorot', async () => {
    const res = await resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v1', tenantId: TENANT,
    });
    expect(res.priceAgorot).toBe(9500); // override 95 shekels
    expect(res.tenantId).toBe(TENANT);
    expect(res.offerTitle).toBe('Coffee voucher');
  });

  it('tenant context: variant without override falls back to base member_price', async () => {
    const res = await resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v2', tenantId: TENANT,
    });
    expect(res.priceAgorot).toBe(18000);
  });

  it('null tenant (Nexus catalog): base price, no overrides', async () => {
    const res = await resolvePurchaseOffer(db, {
      identityId: IDENTITY, offerId: OFFER, variantId: 'v1', tenantId: null,
    });
    expect(res.priceAgorot).toBe(9000); // base 90 shekels, override ignored
    expect(res.tenantId).toBeNull();
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
