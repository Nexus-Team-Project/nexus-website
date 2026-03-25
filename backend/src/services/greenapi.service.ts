import axios from 'axios';
import { env } from '../config/env';

// ─── Helpers ──────────────────────────────────────────────

function buildUrl(method: string): string {
  return `${env.GREEN_API_URL}/waInstance${env.GREEN_API_ID_INSTANCE}/${method}/${env.GREEN_API_TOKEN}`;
}

/** Convert phone number to Green API chatId format: "972XXXXXXXXX@c.us" */
export function toChatId(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
  return `${clean}@c.us`;
}

// ─── Send text message ────────────────────────────────────

export async function sendText(to: string, text: string): Promise<string | null> {
  if (!env.GREEN_API_ID_INSTANCE || !env.GREEN_API_TOKEN) return null;

  try {
    const res = await axios.post(buildUrl('sendMessage'), {
      chatId: toChatId(to),
      message: text,
    });
    return res.data?.idMessage ?? null;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('[GreenAPI] sendText error:', err.response?.data);
    }
    return null;
  }
}

// ─── Send agent notification ──────────────────────────────

export async function notifyAgent(message: string): Promise<void> {
  if (!env.AGENT_WHATSAPP_NUMBER) return;
  await sendText(env.AGENT_WHATSAPP_NUMBER, message);
}

// ─── Check instance state ─────────────────────────────────

export async function getStateInstance(): Promise<string | null> {
  if (!env.GREEN_API_ID_INSTANCE || !env.GREEN_API_TOKEN) return null;

  try {
    const res = await axios.get(buildUrl('getStateInstance'));
    return res.data?.stateInstance ?? null;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('[GreenAPI] getStateInstance error:', err.response?.data);
    }
    return null;
  }
}

// ─── Get instance settings ───────────────────────────────

export async function getSettings(): Promise<Record<string, unknown> | null> {
  if (!env.GREEN_API_ID_INSTANCE || !env.GREEN_API_TOKEN) return null;

  try {
    const res = await axios.get(buildUrl('getSettings'));
    return res.data ?? null;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('[GreenAPI] getSettings error:', err.response?.data);
    }
    return null;
  }
}

// ─── Update instance settings ────────────────────────────

export async function setSettings(settings: Record<string, unknown>): Promise<boolean> {
  if (!env.GREEN_API_ID_INSTANCE || !env.GREEN_API_TOKEN) return false;

  try {
    await axios.post(buildUrl('setSettings'), settings);
    return true;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('[GreenAPI] setSettings error:', err.response?.data);
    }
    return false;
  }
}

// ─── Ensure outgoing webhooks are enabled ────────────────

export async function ensureOutgoingWebhooksEnabled(webhookUrl: string): Promise<{
  changed: boolean;
  settings: Record<string, unknown> | null;
}> {
  const current = await getSettings();
  if (!current) return { changed: false, settings: null };

  const fixes: Record<string, unknown> = {};

  // Enable outgoing message webhooks (messages sent from phone)
  if (!current.outgoingWebhook) fixes.outgoingWebhook = 'yes';
  if (!current.outgoingMessageWebhook) fixes.outgoingMessageWebhook = 'yes';
  if (!current.outgoingAPIMessageWebhook) fixes.outgoingAPIMessageWebhook = 'yes';

  // Enable incoming message webhooks
  if (!current.incomingWebhook) fixes.incomingWebhook = 'yes';

  // Ensure webhook URL is set
  if (webhookUrl && current.webhookUrl !== webhookUrl) {
    fixes.webhookUrl = webhookUrl;
  }

  if (Object.keys(fixes).length === 0) {
    return { changed: false, settings: current };
  }

  console.log(`[GreenAPI] Fixing settings:`, fixes);
  const ok = await setSettings(fixes);
  const updated = ok ? await getSettings() : current;
  return { changed: ok, settings: updated };
}
