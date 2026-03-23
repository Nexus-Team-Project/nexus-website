import { prisma } from '../config/database';
import * as ChatService from './chat.service';
import { getIO } from '../socket';
import {
  isConfigured,
  getMailbox,
  graphGet,
  graphPatch,
  type GraphMessage,
} from './outlook-graph.service';

// ─── Microsoft Graph API — Outlook inbox polling ─────────
//
// Polls the agent's Outlook inbox for replies to chat escalation emails.
// Replies are identified by [Chat-XXXXXXXX] in the subject line.
// The reply text is stripped of quoted content and routed to the customer.

// ─── Poll inbox ───────────────────────────────────────────

export async function pollInbox(): Promise<void> {
  if (!isConfigured()) return;

  try {
    const mailbox = getMailbox();

    // Fetch unread emails with [Chat- in the subject
    const filter = encodeURIComponent("isRead eq false and contains(subject,'[Chat-')");
    const select = 'id,subject,from,body,receivedDateTime,conversationId';
    const path = `/users/${mailbox}/messages?$filter=${filter}&$select=${select}&$top=10&$orderby=receivedDateTime asc`;

    const result = await graphGet<{ value: GraphMessage[] }>(path);

    for (const msg of result.value) {
      await processReplyEmail(msg, mailbox);
    }
  } catch (err) {
    console.error('[OutlookInbound] Poll failed:', err);
  }
}

// ─── Process a single reply email ─────────────────────────

async function processReplyEmail(msg: GraphMessage, mailbox: string): Promise<void> {
  try {
    // Extract session short ID from subject
    const match = msg.subject.match(/\[Chat-([a-zA-Z0-9]{6,})\]/);
    if (!match) {
      // Mark as read to avoid re-processing
      await graphPatch(`/users/${mailbox}/messages/${msg.id}`, { isRead: true });
      return;
    }

    const shortId = match[1];

    // Check if we already processed this email (idempotency)
    const alreadyProcessed = await prisma.webhookLog.findUnique({
      where: { externalId: `outlook-${msg.id}` },
    });
    if (alreadyProcessed) {
      await graphPatch(`/users/${mailbox}/messages/${msg.id}`, { isRead: true });
      return;
    }

    // Extract reply text from email body
    const replyText = extractReplyText(msg.body.content, msg.body.contentType);
    if (!replyText.trim()) {
      await graphPatch(`/users/${mailbox}/messages/${msg.id}`, { isRead: true });
      return;
    }

    // Resolve session
    const sessions = await prisma.chatSession.findMany({
      where: {
        id: { endsWith: shortId },
        status: { in: ['OPEN', 'PENDING_HUMAN'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1,
    });

    const session = sessions[0];
    if (!session) {
      console.warn(`[OutlookInbound] Session ${shortId} not found for email ${msg.id}`);
      await graphPatch(`/users/${mailbox}/messages/${msg.id}`, { isRead: true });
      return;
    }

    // Auto-take session if not already in HUMAN mode
    if (session.mode !== 'HUMAN') {
      await prisma.chatSession.update({
        where: { id: session.id },
        data: {
          mode: 'HUMAN',
          status: 'OPEN',
          assignedAgentName: msg.from.emailAddress.name || 'Agent',
          modeLockUntil: new Date(Date.now() + 5000),
        },
      });

      const io = getIO();
      io.to(`session:${session.id}`).emit('mode_changed', { mode: 'HUMAN' });

      await ChatService.saveMessage({
        sessionId: session.id,
        text: 'נציג הצטרף לשיחה.',
        sender: 'SYSTEM',
        channel: 'WEB',
      });
    }

    // Save agent message
    const agentMsg = await ChatService.saveMessage({
      sessionId: session.id,
      text: replyText,
      sender: 'AGENT',
      channel: 'EMAIL',
    });

    // Forward to customer via Socket.io
    const io = getIO();
    io.to(`session:${session.id}`).emit('new_message', {
      id: agentMsg.id,
      text: agentMsg.text,
      sender: agentMsg.sender,
      channel: agentMsg.channel,
      timestamp: agentMsg.createdAt,
    });

    // Mark as processed (idempotency)
    await prisma.webhookLog
      .create({ data: { externalId: `outlook-${msg.id}`, source: 'outlook' } })
      .catch(() => {});

    // Mark email as read in Outlook
    await graphPatch(`/users/${mailbox}/messages/${msg.id}`, { isRead: true });

    console.log(`[OutlookInbound] Routed reply to session ${shortId}: "${replyText.slice(0, 60)}..."`);
  } catch (err) {
    console.error(`[OutlookInbound] Failed to process email ${msg.id}:`, err);
  }
}

// ─── Extract reply text from email ────────────────────────

function extractReplyText(content: string, contentType: string): string {
  let text: string;

  if (contentType === 'html') {
    // Strip HTML tags to get plain text
    text = content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  } else {
    text = content;
  }

  // Strip quoted content (Outlook reply markers)
  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Outlook Hebrew quote markers
    if (trimmed.match(/^מאת:/)) break;
    if (trimmed.match(/^נשלח:/)) break;
    if (trimmed.match(/^אל:/)) break;

    // Outlook English quote markers
    if (trimmed.match(/^From:\s/i)) break;
    if (trimmed.match(/^Sent:\s/i)) break;
    if (trimmed.match(/^To:\s/i)) break;
    if (trimmed.match(/^On .+ wrote:$/)) break;
    if (trimmed.match(/^-{3,}\s*Original Message/i)) break;
    if (trimmed.match(/^-{3,}\s*הודעה מקורית/i)) break;
    if (trimmed.match(/^_{3,}/)) break;

    // Skip quoted lines
    if (trimmed.startsWith('>')) continue;

    result.push(line);
  }

  return result.join('\n').trim();
}
