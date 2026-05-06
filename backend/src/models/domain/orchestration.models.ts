/**
 * Defines event and saga infrastructure documents required by NEXUS flows.
 * These models are inert until future saga services write and consume them.
 */
import type { Collection, Db, ObjectId } from 'mongodb';
import { z } from 'zod';
import { DOMAIN_COLLECTIONS } from './collections';

export const SAGA_STATUSES = ['pending', 'running', 'waiting', 'compensating', 'completed', 'failed'] as const;
export const PLATFORM_EVENT_STATUSES = ['pending', 'processing', 'published', 'failed'] as const;

export const platformEventSchema = z.object({
  platformEventId: z.string().min(1),
  eventType: z.string().min(1).max(200),
  sourceService: z.string().min(1).max(100),
  payload: z.record(z.unknown()),
  authorizationContext: z.record(z.unknown()),
  signature: z.string().min(1).optional(),
  status: z.enum(PLATFORM_EVENT_STATUSES),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const sagaInstanceSchema = z.object({
  sagaInstanceId: z.string().min(1),
  sagaType: z.string().min(1).max(100),
  sagaVersion: z.string().min(1).max(50),
  status: z.enum(SAGA_STATUSES),
  context: z.record(z.unknown()),
  stepHistory: z.array(z.record(z.unknown())).default([]),
  compensationLog: z.array(z.record(z.unknown())).default([]),
  failureReason: z.string().max(1000).optional(),
  failedAt: z.date().optional(),
  clientIdempotencyKey: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  memberId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const processedStepSchema = z.object({
  processedStepId: z.string().min(1),
  sagaInstanceId: z.string().min(1),
  step: z.string().min(1).max(100),
  idempotencyKey: z.string().min(1),
  result: z.record(z.unknown()),
  createdAt: z.date(),
});

export const consumedEventSchema = z.object({
  consumedEventId: z.string().min(1),
  platformEventId: z.string().min(1),
  consumerName: z.string().min(1).max(100),
  createdAt: z.date(),
});

export type PlatformEventDocument = z.infer<typeof platformEventSchema> & { _id?: ObjectId };
export type SagaInstanceDocument = z.infer<typeof sagaInstanceSchema> & { _id?: ObjectId };
export type ProcessedStepDocument = z.infer<typeof processedStepSchema> & { _id?: ObjectId };
export type ConsumedEventDocument = z.infer<typeof consumedEventSchema> & { _id?: ObjectId };

export interface OrchestrationDomainCollections {
  platformEvents: Collection<PlatformEventDocument>;
  sagaInstances: Collection<SagaInstanceDocument>;
  processedSteps: Collection<ProcessedStepDocument>;
  consumedEvents: Collection<ConsumedEventDocument>;
}

/**
 * Returns typed MongoDB collections for events and sagas.
 * Input: Mongo database handle.
 * Output: collection map used by future orchestration services.
 */
export function getOrchestrationDomainCollections(db: Db): OrchestrationDomainCollections {
  return {
    platformEvents: db.collection<PlatformEventDocument>(DOMAIN_COLLECTIONS.platformEvents),
    sagaInstances: db.collection<SagaInstanceDocument>(DOMAIN_COLLECTIONS.sagaInstances),
    processedSteps: db.collection<ProcessedStepDocument>(DOMAIN_COLLECTIONS.processedSteps),
    consumedEvents: db.collection<ConsumedEventDocument>(DOMAIN_COLLECTIONS.consumedEvents),
  };
}
