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
  } catch (err: unknown) {
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
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('[GreenAPI] getStateInstance error:', err.response?.data);
    }
    return null;
  }
}
