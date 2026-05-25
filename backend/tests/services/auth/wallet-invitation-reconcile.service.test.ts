/**
 * Tests for wallet-login auto-accept of pending tenant invitations.
 * The shared accept primitive is mocked so we exercise the reconcile
 * branching logic without pulling in the full invitation domain.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 10.4
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db } from 'mongodb';

vi.mock('../../../src/services/domain-member-invitation-read.service', () => ({
  markTenantMemberInvitationAccepted: vi.fn().mockResolvedValue({
    tenantId: 't1',
    roles: ['member'],
    alreadyAccepted: false,
  }),
}));

import { reconcilePendingInvitations } from '../../../src/services/auth/wallet-invitation-reconcile.service';
import { markTenantMemberInvitationAccepted } from '../../../src/services/domain-member-invitation-read.service';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(process.env.TEST_MONGODB_URI!);
  db = client.db(`nexus_test_${Date.now()}`);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db.collection('tenantMemberInvitations').deleteMany({});
  await db.collection('nexusIdentities').deleteMany({});
  vi.clearAllMocks();
});

describe('reconcilePendingInvitations', () => {
  it('accepts a single pending non-expired invite for the email', async () => {
    await db.collection('nexusIdentities').insertOne({
      nexusIdentityId: 'identity_1',
      normalizedEmail: 'a@b.com',
      status: 'invited',
    });
    await db.collection('tenantMemberInvitations').insertOne({
      tenantId: 't1',
      normalizedEmail: 'a@b.com',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
      tokenHash: 'h',
    });
    const r = await reconcilePendingInvitations(db, {
      nexusIdentityId: 'identity_1',
      email: 'a@b.com',
    });
    expect(r.acceptedTenantIds).toEqual(['t1']);
    expect(markTenantMemberInvitationAccepted).toHaveBeenCalledTimes(1);
  });

  it('promotes identity status from invited to active on any acceptance', async () => {
    await db.collection('nexusIdentities').insertOne({
      nexusIdentityId: 'identity_1',
      normalizedEmail: 'a@b.com',
      status: 'invited',
    });
    await db.collection('tenantMemberInvitations').insertOne({
      tenantId: 't1',
      normalizedEmail: 'a@b.com',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
      tokenHash: 'h',
    });
    await reconcilePendingInvitations(db, {
      nexusIdentityId: 'identity_1',
      email: 'a@b.com',
    });
    const idDoc = await db
      .collection('nexusIdentities')
      .findOne({ nexusIdentityId: 'identity_1' });
    expect(idDoc?.status).toBe('active');
  });

  it('skips expired invites and surfaces them in expiredTenantIds', async () => {
    await db.collection('tenantMemberInvitations').insertOne({
      tenantId: 't2',
      normalizedEmail: 'a@b.com',
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
      tokenHash: 'h',
    });
    const r = await reconcilePendingInvitations(db, {
      nexusIdentityId: 'identity_1',
      email: 'a@b.com',
    });
    expect(r.acceptedTenantIds).toEqual([]);
    expect(r.expiredTenantIds).toEqual(['t2']);
    expect(markTenantMemberInvitationAccepted).not.toHaveBeenCalled();
  });

  it('skips revoked invites', async () => {
    await db.collection('tenantMemberInvitations').insertOne({
      tenantId: 't3',
      normalizedEmail: 'a@b.com',
      status: 'revoked',
      expiresAt: new Date(Date.now() + 86_400_000),
      tokenHash: 'h',
    });
    const r = await reconcilePendingInvitations(db, {
      nexusIdentityId: 'identity_1',
      email: 'a@b.com',
    });
    expect(r.acceptedTenantIds).toEqual([]);
    expect(r.expiredTenantIds).toEqual([]);
    expect(markTenantMemberInvitationAccepted).not.toHaveBeenCalled();
  });

  it('accepts multiple invites for the same email', async () => {
    await db.collection('tenantMemberInvitations').insertMany([
      {
        tenantId: 'ta',
        normalizedEmail: 'a@b.com',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86_400_000),
        tokenHash: 'h1',
      },
      {
        tenantId: 'tb',
        normalizedEmail: 'a@b.com',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86_400_000),
        tokenHash: 'h2',
      },
    ]);
    const r = await reconcilePendingInvitations(db, {
      nexusIdentityId: 'identity_1',
      email: 'a@b.com',
    });
    expect(r.acceptedTenantIds.sort()).toEqual(['ta', 'tb']);
    expect(markTenantMemberInvitationAccepted).toHaveBeenCalledTimes(2);
  });
});
