/**
 * MongoDB schemas and TypeScript interfaces for NEXUS supply layer.
 * Build-mode: one Offer per product (no separate Variant documents yet).
 * raw_cost = what creator pays (stored, never returned to frontend).
 * nexus_price = raw_cost * 1.30 (30% platform margin, computed by backend).
 */
import type { Db } from 'mongodb';
import { z } from 'zod';
import { DOMAIN_COLLECTIONS } from './collections';

export const OFFER_STATUSES = ['draft', 'active', 'inactive'] as const;
export const OFFER_CATEGORIES = [
  'food_beverage', 'fashion', 'health_wellness', 'entertainment',
  'travel', 'technology', 'education', 'financial', 'home_living', 'other',
] as const;
export const OFFER_ADOPTION_STATUSES = ['active', 'excluded'] as const;
export const OFFER_VISIBILITY = ['ecosystem', 'tenant_only'] as const;

export type OfferStatus = typeof OFFER_STATUSES[number];
export type OfferCategory = typeof OFFER_CATEGORIES[number];
export type OfferAdoptionStatus = typeof OFFER_ADOPTION_STATUSES[number];
export type OfferVisibility = typeof OFFER_VISIBILITY[number];

/**
 * Platform-level catalog item created by tenant admins or supply managers.
 * raw_cost stored server-side only. nexus_price = raw_cost * 1.30.
 * NEVER return raw_cost in any API response.
 */
export const nexusOfferSchema = z.object({
  offerId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  imageUrl: z.string().url().optional(),
  category: z.enum(OFFER_CATEGORIES),
  raw_cost: z.number().positive(),
  nexus_price: z.number().positive(),
  market_price: z.number().positive().optional(),
  status: z.enum(OFFER_STATUSES).default('active'),
  visibility: z.enum(OFFER_VISIBILITY).default('ecosystem'),
  createdByTenantId: z.string().min(1),
  createdByIdentityId: z.string().min(1),
  invitedByTenantId: z.string().min(1).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NexusOffer = z.infer<typeof nexusOfferSchema>;

/**
 * Records that a tenant adopted a platform offer for their members.
 * adoptionStatus = active means visible to that tenant's members.
 * member_price = nexus_price in build mode (no margin/subsidy layer yet).
 */
export const tenantOfferConfigSchema = z.object({
  configId: z.string().min(1),
  tenantId: z.string().min(1),
  offerId: z.string().min(1),
  adoptionStatus: z.enum(OFFER_ADOPTION_STATUSES).default('active'),
  adoptedAt: z.date(),
  adoptedByIdentityId: z.string().min(1),
});

export type TenantOfferConfig = z.infer<typeof tenantOfferConfigSchema>;

/**
 * Returns typed MongoDB collection accessors for supply data.
 * Input: connected MongoDB Db instance.
 * Output: { nexusOffers, tenantOfferConfigs } collections.
 */
export function getSupplyDomainCollections(db: Db) {
  return {
    nexusOffers: db.collection<NexusOffer>(DOMAIN_COLLECTIONS.nexusOffers),
    tenantOfferConfigs: db.collection<TenantOfferConfig>(DOMAIN_COLLECTIONS.tenantOfferConfigs),
  };
}
