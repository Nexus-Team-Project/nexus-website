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

  // Nexus Agents — proxy to agent service (optional)
  AGENT_API_URL: z.string().url().optional(),  // e.g. https://nexus-agents-production-ed8b.up.railway.app
  AGENT_API_KEY: z.string().min(1).optional(), // must match SEO_AGENT_API_KEY on the agent service

  // Web Push (VAPID) — optional (push notifications disabled when absent)
  // Generate with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),

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
};
for (const [feature, key] of Object.entries(optional)) {
  if (!key) console.warn(`⚠️  ${feature} disabled — env var not set`);
}
