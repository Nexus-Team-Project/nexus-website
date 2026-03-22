import { z } from 'zod';

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().trim().url(),

  // Database
  DATABASE_URL: z.string().min(1),

  // JWT — always required
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),

  // Google OAuth — client ID required, secret optional (OAuth code flow disabled when absent)
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // WhatsApp Meta Cloud API — optional (feature disabled when absent)
  WHATSAPP_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),

  // WhatsApp provider selection: 'meta' or 'green_api'
  WHATSAPP_PROVIDER: z.enum(['meta', 'green_api']).default('meta'),

  // Green API — optional (feature disabled when absent)
  GREEN_API_URL: z.string().url().default('https://api.green-api.com'),
  GREEN_API_ID_INSTANCE: z.string().min(1).optional(),
  GREEN_API_TOKEN: z.string().min(1).optional(),

  // OpenAI — optional (AI chat disabled when absent)
  OPENAI_API_KEY: z.string().min(1).optional(),

  // Apollo.io — optional (enrichment disabled when absent)
  APOLLO_API_KEY: z.string().min(1).optional(),

  // Notifications
  AGENT_WHATSAPP_NUMBER: z.string().min(1).optional(),
  AGENT_EMAIL: z.string().email().optional(), // Email for chat escalation alerts

  // Email (SendPulse HTTP API) — optional (email disabled when absent)
  SENDPULSE_CLIENT_ID: z.string().min(1).optional(),
  SENDPULSE_CLIENT_SECRET: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Monday.com CRM — optional (CRM disabled when absent)
  MONDAY_API_TOKEN: z.string().min(1).optional(),
  MONDAY_BOARD_ID: z.string().min(1).optional(),
  MONDAY_COLUMN_MAP: z.string().optional(), // JSON: maps logical names to column IDs

  // Payments
  ACTIVE_PAYMENT_PROVIDER: z.enum(['stripe', 'payplus']).default('stripe'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

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
  'WhatsApp Notifications': env.WHATSAPP_TOKEN,
  'Green API WhatsApp': env.GREEN_API_ID_INSTANCE,
  'Apollo Enrichment': env.APOLLO_API_KEY,
  'Monday.com CRM': env.MONDAY_API_TOKEN,
  'Email (SendPulse)': env.SENDPULSE_CLIENT_ID,
};
for (const [feature, key] of Object.entries(optional)) {
  if (!key) console.warn(`⚠️  ${feature} disabled — env var not set`);
}
