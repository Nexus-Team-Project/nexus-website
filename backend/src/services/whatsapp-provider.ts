/**
 * WhatsApp provider abstraction.
 * Uses Meta's WhatsApp Business API exclusively.
 * Outbound messages, agent notifications, and contact info lookups all go through this module.
 */
import * as MetaWhatsApp from './whatsapp.service';

export async function sendText(to: string, text: string): Promise<string | null> {
  return MetaWhatsApp.sendText(to, text);
}

export async function notifyAgent(message: string): Promise<void> {
  return MetaWhatsApp.notifyAgent(message);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- keeps the provider-abstraction signature; Meta has no contact-info lookup yet
export async function getContactInfo(_chatId: string): Promise<{
  name: string | null;
  avatar: string | null;
} | null> {
  return null;
}

// Format helpers — re-export from Meta service
export { formatVisitorAlert, formatChatOpenedAlert, formatLeadAlert } from './whatsapp.service';
