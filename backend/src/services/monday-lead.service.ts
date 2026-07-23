/**
 * Monday.com lead service for the "Website Leads" group of the Leads board
 * (1767743351). Three producers:
 *   - createOnboardingLead: fired when a user completes the dashboard
 *     onboarding wizard.
 *   - createContactSalesLead: fired when the public website contact-sales
 *     form ("צור קשר עם מכירות") is submitted; the message is posted as an
 *     item UPDATE so sales sees the full inquiry on the item.
 *   - createOneTapLead: fired when a NEW user signs up via Google One Tap on
 *     the public website (2026-07-23 spec). Has its own testing-phase gate
 *     (ONE_TAP_LEAD_PRODUCTION_ONLY) instead of the hard production-only rule.
 * All are fire-and-forget: they log and never throw, so a Monday outage can
 * never fail onboarding, the contact form, or a One Tap login. The first two
 * are PRODUCTION-only - outside NODE_ENV=production they log a skip line and
 * do nothing.
 *
 * Legacy monday.service.ts (marketing-site leads, different board) is
 * intentionally untouched.
 *
 * Column ids, the group id, and every label below were verified live
 * against the board on 2026-07-06. The Enrich + Call button columns render
 * automatically on every item - buttons cannot be set via the API.
 *
 * Logging: success logs an audit line (item id, board, lead name, org, role,
 * website, tenant id); failure logs the error message + the same lead
 * context. Phone numbers are deliberately NEVER logged.
 *
 * Spec: docs/superpowers/specs/2026-07-06-onboarding-phone-otp-monday-popup-design.md
 */
import axios from 'axios';
import { env } from '../config/env';
import { normalizeIsraeliPhone } from '../utils/israeliPhone';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const DEFAULT_LEADS_BOARD_ID = '1767743351';
const WEBSITE_LEADS_GROUP_ID = 'group_mm508rc';

/** Board 1767743351 column ids (live-verified 2026-07-06). */
const COLUMN_IDS = {
  title: 'dropdown_mkm0m481',   // Title (dropdown, Hebrew role labels)
  company: 'text_mkm03xx',      // Company (text)
  domain: 'link_mkm069yq',      // Domain (link)
  status: 'status',             // Status (status) -> Unqualified
  urgency: 'color_mm4rpaac',    // Urgency (status) -> High
  priority: 'color_mkp0zbmj',   // Priority (status) -> High
  phone: 'phone_mkm0hsrh',      // Phone (phone)
  email: 'email_mkm011dr',      // Email (email)
} as const;

/** Onboarding contactRole -> the board's Hebrew Title dropdown label. */
const CONTACT_ROLE_LABELS: Record<string, string> = {
  owner: 'בעלים',
  ceo: 'מנכ"ל',
  finance: 'כספים',
  operations: 'תפעול',
  marketing: 'שיווק',
  product: 'מוצר',
  developer: 'פיתוח',
  other: 'אחר',
};

export interface OnboardingLeadInput {
  /** Item name (the Lead column) - the login user's full name. */
  fullName: string;
  /** Onboarding role id (owner|ceo|finance|operations|marketing|product|developer|other). */
  contactRole: string;
  organizationName: string;
  /** Website URL as typed in onboarding (may lack a scheme). */
  website: string;
  /** Contact phone as submitted (E164 or local). */
  phone: string;
  /** Domain tenant id, for log correlation only. */
  tenantId: string;
}

/**
 * Build the Monday column_values payload for one onboarding lead.
 * Pure - exported for unit testing.
 * Input: the lead fields. Output: column-id keyed value map.
 */
export function buildLeadColumnValues(input: OnboardingLeadInput): Record<string, unknown> {
  const website = input.website.trim();
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const values: Record<string, unknown> = {
    [COLUMN_IDS.company]: input.organizationName,
    [COLUMN_IDS.domain]: { url, text: website },
    [COLUMN_IDS.status]: { label: 'Unqualified' },
    [COLUMN_IDS.urgency]: { label: 'High' },
    [COLUMN_IDS.priority]: { label: 'High' },
  };
  const roleLabel = CONTACT_ROLE_LABELS[input.contactRole];
  if (roleLabel) values[COLUMN_IDS.title] = { labels: [roleLabel] };
  const israeli = normalizeIsraeliPhone(input.phone);
  values[COLUMN_IDS.phone] = israeli
    ? { phone: israeli, countryShortName: 'IL' }
    : { phone: input.phone.replace(/[^\d+]/g, '') };
  return values;
}

/**
 * Minimal Monday GraphQL POST. Throws on transport or GraphQL errors.
 * Input: query + variables. Output: the response `data` object.
 */
async function mondayGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await axios.post(
    MONDAY_API_URL,
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: env.MONDAY_API_TOKEN,
        'API-Version': '2025-04',
      },
      timeout: 15000,
    },
  );
  if (res.data?.errors) {
    throw new Error(res.data.errors[0]?.message ?? 'monday_api_error');
  }
  return res.data?.data as T;
}

/**
 * Create one item in the Website Leads group. Throws on failure.
 * Input: item name + column values map. Output: the new Monday item id.
 */
async function createWebsiteLeadsItem(itemName: string, columnValues: Record<string, unknown>): Promise<string> {
  const boardId = env.MONDAY_LEADS_BOARD_ID ?? DEFAULT_LEADS_BOARD_ID;
  const query = `
    mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(
        board_id: $boardId
        group_id: $groupId
        item_name: $itemName
        column_values: $columnValues
        create_labels_if_missing: false
      ) { id }
    }
  `;
  const data = await mondayGraphql<{ create_item: { id: string } }>(query, {
    boardId,
    groupId: WEBSITE_LEADS_GROUP_ID,
    itemName: itemName.trim() || 'Unknown Lead',
    columnValues: JSON.stringify(columnValues),
  });
  return data.create_item.id;
}

/**
 * Create the Website Leads item for a completed onboarding. Never throws;
 * logs outcome either way.
 * Input: the lead fields. Output: resolves when the attempt finished.
 */
export async function createOnboardingLead(input: OnboardingLeadInput): Promise<void> {
  // Leads are PRODUCTION-only: dev/test onboarding runs must not pollute the
  // sales board.
  if (env.NODE_ENV !== 'production') {
    console.info(`[monday-lead] non-production env - skipping onboarding lead for tenant ${input.tenantId}`);
    return;
  }
  if (!env.MONDAY_API_TOKEN) {
    console.warn(`[monday-lead] MONDAY_API_TOKEN not set - skipping lead for tenant ${input.tenantId}`);
    return;
  }
  try {
    const itemId = await createWebsiteLeadsItem(input.fullName, buildLeadColumnValues(input));
    console.info(
      `[monday-lead] created Website Leads item ${itemId} on board ${env.MONDAY_LEADS_BOARD_ID ?? DEFAULT_LEADS_BOARD_ID} - ` +
      `lead "${input.fullName}", org "${input.organizationName}", role ${input.contactRole}, ` +
      `website ${input.website}, tenant ${input.tenantId}`,
    );
  } catch (err) {
    console.error(
      `[monday-lead] failed to create lead - org "${input.organizationName}", tenant ${input.tenantId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ─── Contact-sales leads ─────────────────────────────────────────────────────

export interface ContactSalesLeadInput {
  /** Required form field - also the Email column value. */
  email: string;
  /** Optional form fields. */
  name?: string;
  phone?: string;
  /** The inquiry text - posted as an item UPDATE (not a column). */
  message: string;
  /** Page the form was submitted from, appended to the update for context. */
  page?: string;
}

/**
 * Build the Monday column_values payload for one contact-sales lead. The
 * form has no role/company/website, so board-required tags fall back to
 * defaults: Title=אחר, Status=Unqualified, Urgency=High, Priority=High.
 * The free-text Company column carries the inquiry MESSAGE so it is visible
 * directly in the board table (the full message also lands in the item
 * update for long texts).
 * Pure - exported for unit testing.
 * Input: the sanitized form fields. Output: column-id keyed value map.
 */
export function buildContactSalesColumnValues(input: ContactSalesLeadInput): Record<string, unknown> {
  const values: Record<string, unknown> = {
    [COLUMN_IDS.title]: { labels: [CONTACT_ROLE_LABELS.other] },
    [COLUMN_IDS.company]: input.message,
    [COLUMN_IDS.status]: { label: 'Unqualified' },
    [COLUMN_IDS.urgency]: { label: 'High' },
    [COLUMN_IDS.priority]: { label: 'High' },
    [COLUMN_IDS.email]: { email: input.email, text: input.email },
  };
  if (input.phone) {
    const israeli = normalizeIsraeliPhone(input.phone);
    values[COLUMN_IDS.phone] = israeli
      ? { phone: israeli, countryShortName: 'IL' }
      : { phone: input.phone.replace(/[^\d+]/g, '') };
  }
  return values;
}

/**
 * Create the Website Leads item for a contact-sales submission and post the
 * inquiry message as an item update. Never throws; logs outcome either way.
 * Input: the sanitized form fields. Output: resolves when the attempt finished.
 */
export async function createContactSalesLead(input: ContactSalesLeadInput): Promise<void> {
  // Leads are PRODUCTION-only: dev/test form submissions must not pollute the
  // sales board.
  if (env.NODE_ENV !== 'production') {
    console.info(`[monday-lead] non-production env - skipping contact-sales lead for ${input.email}`);
    return;
  }
  if (!env.MONDAY_API_TOKEN) {
    console.warn(`[monday-lead] MONDAY_API_TOKEN not set - skipping contact-sales lead for ${input.email}`);
    return;
  }
  try {
    const itemId = await createWebsiteLeadsItem(
      input.name?.trim() || input.email,
      buildContactSalesColumnValues(input),
    );
    // The free-text inquiry goes into the item's Updates feed so sales reads
    // it in context. Best-effort: an update failure keeps the lead.
    const body = input.page ? `${input.message}\n\n(page: ${input.page})` : input.message;
    await mondayGraphql(
      'mutation ($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }',
      { itemId, body },
    ).catch((e) => {
      console.warn(`[monday-lead] contact-sales update post failed for item ${itemId}:`, e instanceof Error ? e.message : e);
    });
    console.info(
      `[monday-lead] created contact-sales Website Leads item ${itemId} on board ${env.MONDAY_LEADS_BOARD_ID ?? DEFAULT_LEADS_BOARD_ID} - ` +
      `lead "${input.name ?? ''}", email ${input.email}${input.page ? `, page ${input.page}` : ''}`,
    );
  } catch (err) {
    console.error(
      `[monday-lead] failed to create contact-sales lead - email ${input.email}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ─── One Tap leads ───────────────────────────────────────────────────────────

/**
 * One Tap leads are PRODUCTION-only, like the other two producers. (Was
 * false during the 2026-07-23 testing phase; flipped after verification.)
 */
export const ONE_TAP_LEAD_PRODUCTION_ONLY = true;

export interface OneTapLeadInput {
  /** Google account email - also the Email column value. */
  email: string;
  /** Google full name; falls back to the email as the item name. */
  fullName?: string | null;
  /** Website path the One Tap happened on (e.g. /partners), for context. */
  page?: string;
}

/**
 * Builds the lead message shown in the Company column + item update. The
 * email leads the text because some board views hide the Email column -
 * sales must see who signed up directly in the table.
 * Pure - exported for unit testing.
 * Input: lead email + optional page path. Output: the message string.
 */
export function buildOneTapLeadMessage(email: string, page?: string): string {
  const suffix = page ? ` (page: ${page})` : '';
  return `${email} - Google One Tap signup${suffix}`;
}

/**
 * Create a Website Leads item for a NEW user who signed up via Google One
 * Tap on the public website. Never throws; logs outcome either way.
 * Gating: skipped outside production only once ONE_TAP_LEAD_PRODUCTION_ONLY
 * is flipped to true (currently fires in every env for testing).
 * Input: Google-derived lead fields. Output: resolves when the attempt finished.
 */
export async function createOneTapLead(input: OneTapLeadInput): Promise<void> {
  if (ONE_TAP_LEAD_PRODUCTION_ONLY && env.NODE_ENV !== 'production') {
    console.info(`[monday-lead] non-production env - skipping one-tap lead for ${input.email}`);
    return;
  }
  if (!env.MONDAY_API_TOKEN) {
    console.warn(`[monday-lead] MONDAY_API_TOKEN not set - skipping one-tap lead for ${input.email}`);
    return;
  }
  const message = buildOneTapLeadMessage(input.email, input.page);
  try {
    const itemId = await createWebsiteLeadsItem(
      input.fullName?.trim() || input.email,
      buildContactSalesColumnValues({ email: input.email, name: input.fullName ?? undefined, message }),
    );
    // Post the context as an item update too, mirroring contact-sales. Best-effort.
    await mondayGraphql(
      'mutation ($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }',
      { itemId, body: message },
    ).catch((e) => {
      console.warn(`[monday-lead] one-tap update post failed for item ${itemId}:`, e instanceof Error ? e.message : e);
    });
    console.info(
      `[monday-lead] created one-tap Website Leads item ${itemId} on board ${env.MONDAY_LEADS_BOARD_ID ?? DEFAULT_LEADS_BOARD_ID} - ` +
      `lead "${input.fullName ?? ''}", email ${input.email}${input.page ? `, page ${input.page}` : ''}`,
    );
  } catch (err) {
    console.error(
      `[monday-lead] failed to create one-tap lead - email ${input.email}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
