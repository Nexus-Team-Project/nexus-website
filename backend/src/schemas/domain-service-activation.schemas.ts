/**
 * Defines request schemas for tenant service activation APIs.
 * These schemas protect domain service setup routes from untrusted input.
 */
import { z } from 'zod';

export const benefitsCatalogActivationSchema = z.object({
  startingMode: z.enum(['plug_and_play', 'curated', 'build_from_scratch']),
});

export type BenefitsCatalogActivationInput = z.infer<typeof benefitsCatalogActivationSchema>;
