import { prisma } from '../config/database';
import * as AiService from './ai.service';
import * as WhatsAppProvider from './whatsapp-provider';

/**
 * Generate an AI suggestion in the background while a session is in HUMAN mode.
 * The suggestion is sent ONLY to the assigned agent via WhatsApp — never to the customer.
 */
export async function generateSuggestion(
  sessionId: string,
  customerMessage: string,
  recentMessages: Array<{ sender: string; text: string }>,
): Promise<void> {
  try {
    // 1. Re-fetch session to verify mode and agent
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session || session.mode !== 'HUMAN' || !session.assignedAgentWa) return;

    // 2. Detect language from session metadata
    const meta = (session.metadata as Record<string, unknown>) ?? {};
    const lang = (meta.language as string)?.startsWith?.('en') ? 'en' : 'he';

    // 3. Generate AI reply using existing AI service
    const aiReply = await AiService.generateReply(sessionId, customerMessage, recentMessages, lang, {
      visitorId: session.visitorId,
      page: meta.page as string | undefined,
    });

    if (!aiReply?.text) return;

    // 4. Save suggestion to DB (audit trail)
    const suggestion = await prisma.aiSuggestion.create({
      data: {
        sessionId,
        suggestion: aiReply.text,
      },
    });

    // 5. Send ONLY to agent via WhatsApp (NOT to customer)
    // Prefer group if available, otherwise direct message
    const groupId = session.whatsappGroupId;
    if (groupId) {
      await WhatsAppProvider.sendToGroup(
        groupId,
        `*הצעת AI:*\n${aiReply.text}`,
      );
    } else {
      const shortId = session.id.slice(-8);
      await WhatsAppProvider.sendText(
        session.assignedAgentWa,
        `[${shortId}] הצעת AI:\n${aiReply.text}`,
      );
    }

    // 6. Mark as sent
    await prisma.aiSuggestion.update({
      where: { id: suggestion.id },
      data: { sentToAgent: true },
    });
  } catch (err) {
    console.error('[AiSuggestion] Failed to generate suggestion:', err);
  }
}
