/**
 * Validates and exports backend environment variables at process startup.
 * Required values fail fast so a Railway deployment cannot boot with broken
 * secrets, database settings, or public service URLs.
 */
import { z } from 'zod';

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().trim().url(),
  BACKEND_URL: z.string().trim().url().optional(),
  DASHBOARD_URL: z.string().trim().url().optional(),
  USER_MGMT_URL: z.string().trim().url().optional(),
  NEXUS_ADMIN_EMAILS: z.string().optional(),

  // Database
  DATABASE_URL: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1).default('nexus'),

  // JWT — always required
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),

  // Cookie domain — set to e.g. .nexus-payment.com in production so the
  // httpOnly refresh cookie is shared across website, dashboard, and api subdomains.
  // Leave unset in development.
  COOKIE_DOMAIN: z.string().min(1).optional(),

  // Cross-site cookies — set 'true' when the frontends and the API are served
  // from DIFFERENT registrable domains over HTTPS (e.g. the Railway dev deploy
  // where each *.up.railway.app host is a separate site per the Public Suffix
  // List). When on, the refresh/trusted-device cookies use SameSite=None; Secure
  // so the browser sends them on the cross-site refresh call; otherwise they stay
  // SameSite=Lax (correct for same-registrable-domain prod + http localhost).
  // MUST stay off for localhost — SameSite=None requires Secure, which does not
  // set on http://localhost.
  CROSS_SITE_COOKIES: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  // Catalog search engine. 'true' requires MongoDB hosted on Atlas (the module
  // runs $search aggregations + creates Atlas Search indexes at startup).
  // 'false' (default) selects the regex fallback engine - same contract, no
  // typo tolerance. Tests and non-Atlas environments stay on the fallback.
  ATLAS_SEARCH_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  // Google OAuth — client ID required, secret optional (OAuth code flow disabled when absent)
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // OpenAI — optional (AI chat disabled when absent)
  OPENAI_API_KEY: z.string().min(1).optional(),

  // Apollo.io — optional (enrichment disabled when absent)
  APOLLO_API_KEY: z.string().min(1).optional(),

  // Notifications
  AGENT_EMAIL: z.string().email().optional(), // Email for chat escalation alerts
  INBOUND_EMAIL_SECRET: z.string().min(1).optional(), // Required to use email-inbound webhook — route rejects all requests if not set

  // Microsoft Graph API — for reading Outlook inbox replies
  MS_TENANT_ID: z.string().min(1).optional(),
  MS_CLIENT_ID: z.string().min(1).optional(),
  MS_CLIENT_SECRET: z.string().min(1).optional(),
  MS_MAILBOX: z.string().email().optional(), // e.g. admin@nexus-payment.com

  // Email — SMTP (preferred) or SendPulse HTTP API fallback
  SMTP_HOST: z.string().min(1).optional(),          // e.g. smtp-pulse.com
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SENDPULSE_CLIENT_ID: z.string().min(1).optional(),
  SENDPULSE_CLIENT_SECRET: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_ASSET_BASE_URL: z.string().trim().url().optional(),

  // Monday.com CRM — optional (CRM disabled when absent)
  MONDAY_API_TOKEN: z.string().min(1).optional(),
  MONDAY_BOARD_ID: z.string().min(1).optional(),
  MONDAY_COLUMN_MAP: z.string().optional(), // JSON: maps logical names to column IDs
  MONDAY_LEADS_BOARD_ID: z.string().min(1).optional(), // onboarding Website Leads board (default 1767743351)

  // WhatsApp — Meta Cloud API (optional)
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_TOKEN: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),

  // WhatsApp — Meta only
  AGENT_WHATSAPP_NUMBER: z.string().min(1).optional(),

  // Payments
  ACTIVE_PAYMENT_PROVIDER: z.enum(['stripe', 'payplus']).default('stripe'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // PayMe - the payment provider for all NEW payment work (wallet voucher
  // purchases). Sandbox by default; production switch = change these values
  // only (no code change). Spec: docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md
  PAYME_BASE_URL: z.string().trim().url().default('https://sandbox.payme.io/api'),
  PAYME_CLIENT_KEY: z.string().min(1).optional(),
  PAYME_CLIENT_SECRET: z.string().min(1).optional(),
  PAYME_SELLER_ID: z.string().min(1).optional(),
  // Public base URL PayMe posts IPN callbacks to (dev: a cloudflared/ngrok
  // tunnel URL - PayMe rejects localhost). Falls back to BACKEND_URL.
  PAYME_CALLBACK_BASE_URL: z.string().trim().url().optional(),

  // SUMIT (OfficeGuy) - receipts for wallet purchases. Documents are created
  // as DRAFTS outside production (safe testing against the real company).
  SUMIT_COMPANY_ID: z.coerce.number().int().positive().optional(),
  SUMIT_API_KEY: z.string().min(1).optional(),
  // 1 = InvoiceAndReceipt (חשבונית מס קבלה), 2 = Receipt (קבלה).
  SUMIT_DOCUMENT_TYPE: z.coerce.number().int().default(1),

  // Cloudinary — backend-only media storage (offer images). Never expose to frontend.
  // Format: cloudinary://api_key:api_secret@cloud_name
  CLOUDINARY_URL: z.string().min(1).optional(),

  // InforU - SMS OTP provider for wallet phone login. Backend-only.
  // Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md
  INFORU_USER: z.string().min(1).optional(),
  INFORU_TOKEN: z.string().min(1).optional(),
  INFORU_BASE_URL: z.string().trim().url().default('https://capi.inforu.co.il'),
  // Sender ID shown on the OTP SMS (alphanumeric, must be approved by InforU for
  // production; falls back to 'Nexus' if unset).
  INFORU_SENDER: z.string().trim().min(1).optional(),

  // Wallet - public URL for the wallet app (wallet.nexus-payment.com).
  WALLET_URL: z.string().trim().url().optional(),

  // Nexus Agents — proxy to agent service (optional)
  AGENT_API_URL: z.string().url().optional(),  // e.g. https://nexus-agents-production-ed8b.up.railway.app
  AGENT_API_KEY: z.string().min(1).optional(), // must match SEO_AGENT_API_KEY on the agent service

  // Web Push (VAPID) — optional (push notifications disabled when absent)
  // Generate with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),

  // Member invite worker — bulk-async delivery tuning.
  // Concurrency: in-flight SendPulse calls per backend process.
  // Rate: global send token-bucket refill rate (per second).
  INVITE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  INVITE_SEND_RATE_PER_SEC: z.coerce.number().int().min(1).max(100).default(10),

});

// Validate on startup — crash fast if core vars missing
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

// Warn about disabled optional features
const optional = {
  'Google OAuth': env.GOOGLE_CLIENT_SECRET,
  'AI Chat (OpenAI)': env.OPENAI_API_KEY,
  'Apollo Enrichment': env.APOLLO_API_KEY,
  'Monday.com CRM': env.MONDAY_API_TOKEN,
  'Email (SMTP)': env.SMTP_HOST,
  'Email (SendPulse API fallback)': env.SENDPULSE_CLIENT_ID,
  'Web Push Notifications': env.VAPID_PUBLIC_KEY,
  'Cloudinary (offer image uploads)': env.CLOUDINARY_URL,
  'InforU SMS (wallet phone OTP)': env.INFORU_USER,
  'PayMe payments (wallet purchases)': env.PAYME_CLIENT_KEY,
  'SUMIT receipts (wallet purchases)': env.SUMIT_API_KEY,
};
for (const [feature, key] of Object.entries(optional)) {
  if (!key) console.warn(`⚠️  ${feature} disabled — env var not set`);
}
