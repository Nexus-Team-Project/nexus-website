/**
 * Purpose: Shared types for the full Nexus user cleanup script.
 *
 * These types keep the CLI, Prisma cleanup, and Mongo cleanup modules small.
 */
import type { ObjectId } from 'mongodb';

export type ScriptArgs = {
  email: string;
  apply: boolean;
};

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
  legacyOwnedTenantIds: ObjectId[];
  legacyMemberTenantIds: string[];
};

export type OrchestrationDeletionTargets = {
  platformEventIds: string[];
  sagaInstanceIds: string[];
};
