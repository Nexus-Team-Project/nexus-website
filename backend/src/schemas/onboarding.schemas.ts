/**
 * Defines Zod schemas for onboarding and business setup API boundaries.
 * These schemas validate dashboard input before it reaches MongoDB.
 */
import { z } from 'zod';
import { CONTACT_ROLES, USE_CASES } from '../models/onboarding.models';

const domainPattern = /^(https?:\/\/)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?(?:\/.*)?$/i;
const phonePattern = /^[+()\d\s.-]{7,20}$/;

/**
 * Validates that a string is a usable URL or domain-like website value.
 * Input: raw website string.
 * Output: true for valid URL/domain values.
 */
function isValidWebsite(value: string): boolean {
  if (!domainPattern.test(value.trim())) return false;
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.hostname.includes('.') && url.hostname.length >= 4;
  } catch {
    return false;
  }
}

export const workspaceSetupBodySchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  website: z.string().trim().min(3).max(200).refine(isValidWebsite, 'Invalid website'),
  businessDescription: z.string().trim().min(20).max(1000),
  selectedUseCases: z.array(z.enum(USE_CASES)).min(1),
  contactPhone: z.string().trim().min(7).max(20).regex(phonePattern),
  contactRole: z.enum(CONTACT_ROLES),
});

export const workspaceSetupRequestSchema = z.object({
  body: workspaceSetupBodySchema,
});

export const skipWorkspaceRequestSchema = z.object({
  body: z.object({
    skipReason: z.enum(['regular_user', 'complete_later']),
  }),
});

const ownerSchema = z.object({
  first_name: z.string().max(120).optional(),
  last_name: z.string().max(120).optional(),
  email: z.string().email().or(z.literal('')).optional(),
});

const businessSetupDataSchema = z.object({
  business_location: z.string().max(120).optional(),
  business_type: z.string().max(120).optional(),
  business_structure: z.string().max(120).optional(),
  has_ein: z.string().max(20).optional(),
  ein: z.string().max(80).optional(),
  legal_name_en: z.string().max(200).optional(),
  legal_name_he: z.string().max(200).optional(),
  dba_name_en: z.string().max(200).optional(),
  dba_name_he: z.string().max(200).optional(),
  business_address_country: z.string().max(120).optional(),
  business_address_street: z.string().max(200).optional(),
  business_address_house: z.string().max(40).optional(),
  business_address_apt: z.string().max(40).optional(),
  business_address_city: z.string().max(120).optional(),
  business_address_state: z.string().max(120).optional(),
  business_address_postal: z.string().max(40).optional(),
  business_phone: z.string().max(40).optional(),
  business_website: z.string().max(200).optional(),
  has_website: z.string().max(20).optional(),
  business_activity_desc: z.string().max(1000).optional(),
  product_category: z.string().max(120).optional(),
  products_offered: z.string().max(1000).optional(),
  transaction_types: z.string().max(300).optional(),
  product_source: z.string().max(300).optional(),
  sales_method: z.string().max(300).optional(),
  customer_type: z.array(z.string().max(120)).optional(),
  tourist_card_volume: z.string().max(120).optional(),
  rep_first_name: z.string().max(120).optional(),
  rep_last_name: z.string().max(120).optional(),
  rep_email: z.string().email().or(z.literal('')).optional(),
  rep_job_title: z.string().max(120).optional(),
  rep_dob: z.string().max(40).optional(),
  rep_national_id: z.string().max(120).optional(),
  rep_id_issue_date: z.string().max(40).optional(),
  rep_gender: z.string().max(40).optional(),
  rep_address_country: z.string().max(120).optional(),
  rep_address_street: z.string().max(200).optional(),
  rep_address_house: z.string().max(40).optional(),
  rep_address_apt: z.string().max(40).optional(),
  rep_address_city: z.string().max(120).optional(),
  rep_address_state: z.string().max(120).optional(),
  rep_address_postal: z.string().max(40).optional(),
  rep_phone: z.string().max(40).optional(),
  rep_owns_25_plus: z.boolean().optional(),
  owners: z.array(ownerSchema).max(20).optional(),
  bank_selection: z.string().max(120).optional(),
  bank_branch: z.string().max(120).optional(),
  routing_number: z.string().max(120).optional(),
  account_number: z.string().max(120).optional(),
  confirm_account_number: z.string().max(120).optional(),
  public_business_name: z.string().max(200).optional(),
  statement_descriptor: z.string().max(120).optional(),
  shortened_descriptor: z.string().max(80).optional(),
  support_phone: z.string().max(40).optional(),
  show_phone_receipts: z.boolean().optional(),
  support_address_country: z.string().max(120).optional(),
  support_address_street: z.string().max(200).optional(),
  support_address_apt: z.string().max(40).optional(),
  support_address_city: z.string().max(120).optional(),
  support_address_state: z.string().max(120).optional(),
  support_address_postal: z.string().max(40).optional(),
  security_method: z.string().max(120).optional(),
});

export const businessSetupPatchRequestSchema = z.object({
  body: z.object({
    data: businessSetupDataSchema,
  }),
});

export const businessSetupSubmitRequestSchema = z.object({
  body: z.object({
    data: businessSetupDataSchema,
  }),
});

export type WorkspaceSetupInput = z.infer<typeof workspaceSetupBodySchema>;
export type SkipWorkspaceInput = z.infer<typeof skipWorkspaceRequestSchema>['body'];
export type BusinessSetupInput = z.infer<typeof businessSetupDataSchema>;
