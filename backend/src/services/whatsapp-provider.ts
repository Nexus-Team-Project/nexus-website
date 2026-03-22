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

// Format helpers are provider-agnostic — re-export from Meta service
export {
  formatVisitorAlert,
  formatChatOpenedAlert,
  formatLeadAlert,
} from './whatsapp.service';
