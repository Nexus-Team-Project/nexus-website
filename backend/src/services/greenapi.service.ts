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

// ─── Send message to a group ─────────────────────────────

export async function sendToGroup(groupChatId: string, text: string): Promise<string | null> {
  if (!env.GREEN_API_ID_INSTANCE || !env.GREEN_API_TOKEN) return null;

  try {
    const res = await axios.post(buildUrl('sendMessage'), {
      chatId: groupChatId, // e.g. "120363425825596249@g.us"
      message: text,
    });
    return res.data?.idMessage ?? null;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('[GreenAPI] sendToGroup error:', err.response?.data);
    }
    return null;
  }
}

// ─── Create a WhatsApp group ─────────────────────────────

export async function createGroup(
  groupName: string,
  participantPhones: string[],
): Promise<{ chatId: string; inviteLink: string } | null> {
  if (!env.GREEN_API_ID_INSTANCE || !env.GREEN_API_TOKEN) return null;

  try {
    const chatIds = participantPhones.map(toChatId);
    const res = await axios.post(buildUrl('createGroup'), {
      groupName,
      chatIds,
    });
    if (res.data?.created) {
      return {
        chatId: res.data.chatId,
        inviteLink: res.data.groupInviteLink ?? '',
      };
    }
    return null;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('[GreenAPI] createGroup error:', err.response?.data);
    }
    return null;
  }
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
