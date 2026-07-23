/**
 * Tests for the saved wallet payment-cards service: CRUD is caller-scoped by
 * nexusIdentityId, list views NEVER carry the PayMe buyerKey token, and a
 * caller can only delete / charge-read their OWN cards.
 * Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md s.4
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';
import {
  listCards,
  addCard,
  deleteCard,
  getCardForCharge,
} from '../../src/services/wallet/payment-cards.service';
import { WALLET_PAYMENT_CARDS_COLLECTION } from '../../src/models/payments/wallet-payments.models';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`wallet_payment_cards_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection(WALLET_PAYMENT_CARDS_COLLECTION).deleteMany({});
});

const CARD_INPUT = {
  token: 'BUYER154-0987247Y-MLJ10OI7-LXRDNDYP',
  cardMask: '532610******5846',
  cardBrand: 'mastercard',
  expiry: '1230',
};

describe('addCard + listCards', () => {
  it('stores the token and lists a view WITHOUT buyerKey', async () => {
    const created = await addCard(db, 'id1', CARD_INPUT);
    expect(created.cardId).toBeTruthy();
    expect('buyerKey' in created).toBe(false);
    expect('token' in created).toBe(false);

    const cards = await listCards(db, 'id1');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      cardId: created.cardId,
      cardMask: '****5846',
      cardBrand: 'mastercard',
      expiry: '1230',
    });
    // multiple cards per user allowed
    await addCard(db, 'id1', { ...CARD_INPUT, token: 'BUYER154-OTHERTOK-MLJ10OI7-LXRDNDYP', cardMask: '411111******1111', cardBrand: 'visa' });
    expect(await listCards(db, 'id1')).toHaveLength(2);
    // other identity sees nothing
    expect(await listCards(db, 'other')).toHaveLength(0);
  });
});

describe('deleteCard', () => {
  it('deletes own card; rejects someone elses with card_not_found', async () => {
    const created = await addCard(db, 'id1', CARD_INPUT);
    await expect(deleteCard(db, 'intruder', created.cardId)).rejects.toThrow('card_not_found');
    await deleteCard(db, 'id1', created.cardId);
    expect(await listCards(db, 'id1')).toHaveLength(0);
  });
});

describe('getCardForCharge', () => {
  it('returns the buyerKey for the owner only', async () => {
    const created = await addCard(db, 'id1', CARD_INPUT);
    const forCharge = await getCardForCharge(db, 'id1', created.cardId);
    expect(forCharge).toEqual({
      cardId: created.cardId,
      buyerKey: CARD_INPUT.token,
      cardMask: '****5846',
    });
    await expect(getCardForCharge(db, 'intruder', created.cardId)).rejects.toThrow('card_not_found');
  });
});
