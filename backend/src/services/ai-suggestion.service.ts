import { prisma } from '../config/database';
import * as AiService from './ai.service';
import * as SalesAgentClient from './sales-agent-client';
import * as WhatsAppProvider from './whatsapp-provider';

/**
 * Generate an AI suggestion in the background while a session is in HUMAN mode.
 * The suggestion is sent ONLY to the assigned agent via WhatsApp — never to the customer.
 *
 * Tries nexus-agents sales API first, falls back to local AiService.
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
    const meta = (session.metadata as Record<string, any>) ?? {};
    const lang = meta.language?.startsWith?.('en') ? 'en' : 'he';

    // 3. Try nexus-agents first, fall back to local AI
    let aiText: string | undefined;

    const agentSuggestion = await SalesAgentClient.requestAiSuggestion({
      sessionId,
      customerMessage,
      recentMessages,
    });

    if (agentSuggestion) {
      aiText = agentSuggestion.text;
    } else {
      // Fallback to local AI
      const aiReply = await AiService.generateReply(sessionId, customerMessage, recentMessages, lang, {
        visitorId: session.visitorId,
        page: meta.page,
      });
      aiText = aiReply?.text;
    }

    if (!aiText) return;

    // 4. Save suggestion to DB (audit trail)
    const suggestion = await prisma.aiSuggestion.create({
      data: {
        sessionId,
        suggestion: aiText,
      },
    });

    // 5. Send ONLY to agent via WhatsApp (NOT to customer)
    const shortId = session.id.slice(-8);
    await WhatsAppProvider.sendText(
      session.assignedAgentWa,
      `[${shortId}] 💡 הצעת AI:\n${aiText}`,
    );

    // 6. Mark as sent
    await prisma.aiSuggestion.update({
      where: { id: suggestion.id },
      data: { sentToAgent: true },
    });
  } catch (err) {
    console.error('[AiSuggestion] Failed to generate suggestion:', err);
  }
}
