import * as MetaWhatsApp from './whatsapp.service';
import * as GreenApi from './greenapi.service';
import { env } from '../config/env';

function provider() {
  return env.WHATSAPP_PROVIDER === 'green_api' ? GreenApi : MetaWhatsApp;
}

export async function sendText(to: string, text: string): Promise<string | null> {
  return provider().sendText(to, text);
}

export async function notifyAgent(message: string): Promise<void> {
  return provider().notifyAgent(message);
}

// ─── Group support (Green API only) ──────────────────────

export async function createGroup(
  groupName: string,
  participantPhones: string[],
): Promise<{ chatId: string; inviteLink: string } | null> {
  if (env.WHATSAPP_PROVIDER !== 'green_api') return null;
  return GreenApi.createGroup(groupName, participantPhones);
}

export async function sendToGroup(groupChatId: string, text: string): Promise<string | null> {
  if (env.WHATSAPP_PROVIDER !== 'green_api') return null;
  return GreenApi.sendToGroup(groupChatId, text);
}

// Format helpers are provider-agnostic — re-export from Meta service
export {
  formatVisitorAlert,
  formatChatOpenedAlert,
  formatLeadAlert,
} from './whatsapp.service';
