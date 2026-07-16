/**
 * Zod boundaries for the service-outreach endpoints (preview + enqueue).
 * serviceKey is constrained to SERVICE_KEYS so it is always safe to embed
 * in Mongo dot paths (serviceInvites.<serviceKey>.lastSentAt).
 */
import { z } from 'zod';
import { SERVICE_KEYS } from '../models/domain/tenant.models';
import { OUTREACH_CHANNELS } from '../models/domain/invite-jobs.models';

export const outreachPreviewSchema = z.object({
  serviceKey: z.enum(SERVICE_KEYS),
  channel: z.enum(OUTREACH_CHANNELS),
  resendAlreadyInvited: z.boolean(),
});
export type OutreachPreviewInput = z.infer<typeof outreachPreviewSchema>;

export const outreachEnqueueSchema = outreachPreviewSchema.extend({
  language: z.enum(['he', 'en']),
});
export type OutreachEnqueueInput = z.infer<typeof outreachEnqueueSchema>;
