/**
 * Purpose: Shared types for full-account deletion (Prisma login + Mongo domain
 * data), used by both the CLI script and the wallet dev self-delete route.
 */
import type { ObjectId } from 'mongodb';

export type PrismaUserSnapshot = {
  id: string;
  email: string;
  fullName: string;
} | null;

export type DeletionCounts = Record<string, number>;

export type MongoDeletionTargets = {
  nexusIdentityIds: string[];
  prismaUserIds: string[];
  domainOwnedTenantIds: string[];
  domainTenantMemberIds: string[];
  domainMemberTenantIds: string[];
  /**
   * offerIds of every NexusOffer created by a tenant the user owns. Captured at
   * target-resolution time so voucher inventory (`voucherCodes`, keyed by
   * offerId) can be counted and deleted alongside the offers.
   */
  domainOwnedOfferIds: string[];
  legacyOwnedTenantIds: ObjectId[];
  legacyMemberTenantIds: string[];
  /**
   * Canonical 05XXXXXXXX phone numbers harvested from the user's
   * NexusIdentity rows. Used to clean wallet auth challenges and
   * rate-limit markers keyed by phone.
   */
  walletPhones: string[];
};

export type OrchestrationDeletionTargets = {
  platformEventIds: string[];
  sagaInstanceIds: string[];
};
