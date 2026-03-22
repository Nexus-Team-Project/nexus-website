import { prisma } from '../config/database';
import * as ChatService from './chat.service';
import * as WhatsAppProvider from './whatsapp-provider';
import * as EmailService from './email.service';
import { env } from '../config/env';
import { getIO, broadcastToAdmins } from '../socket';

// ─── Command Parsing ──────────────────────────────────────

interface ParsedCommand {
  type: 'take' | 'release' | 'message' | 'unknown';
  sessionId?: string;
  messageText?: string;
}

export function parseWhatsAppCommand(text: string): ParsedCommand {
  const trimmed = text.trim();

  const takeMatch = trimmed.match(/^\/take\s+(\S+)/i);
  if (takeMatch) return { type: 'take', sessionId: takeMatch[1] };

  const releaseMatch = trimmed.match(/^\/release\s+(\S+)/i);
  if (releaseMatch) return { type: 'release', sessionId: releaseMatch[1] };

  // <shortId>: <message>  (colon followed by space then content)
  const msgMatch = trimmed.match(/^(\S+):\s+(.+)/s);
  if (msgMatch) return { type: 'message', sessionId: msgMatch[1], messageText: msgMatch[2] };

  return { type: 'unknown' };
}

// ─── Session Resolution (8-char suffix → full session) ────

async function resolveSession(shortId: string) {
  // Try exact match first (full CUID pasted)
  let session = await prisma.chatSession.findUnique({ where: { id: shortId } });
  if (session) return session;

  // Match by suffix among open sessions
  const sessions = await prisma.chatSession.findMany({
    where: {
      id: { endsWith: shortId },
      status: { in: ['OPEN', 'PENDING_HUMAN'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: 1,
  });
  return sessions[0] ?? null;
}

// ─── Main Entry Point ─────────────────────────────────────

export async function handleIncomingWhatsAppMessage(data: {
  from: string;
  text: string;
  externalId: string;
}): Promise<void> {
  const command = parseWhatsAppCommand(data.text);

  switch (command.type) {
    case 'take':
      await handleTakeCommand(command.sessionId!, data.from);
      break;
    case 'release':
      await handleReleaseCommand(command.sessionId!, data.from);
      break;
    case 'message':
      await handleAgentMessage(command.sessionId!, command.messageText!, data.from, data.externalId);
      break;
    case 'unknown':
      await handleUnstructuredMessage(data.from, data.text, data.externalId);
      break;
  }
}

// ─── /take <shortId> ──────────────────────────────────────

async function handleTakeCommand(shortId: string, agentPhone: string): Promise<void> {
  const session = await resolveSession(shortId);
  if (!session) {
    await WhatsAppProvider.sendText(agentPhone, `❌ סשן ${shortId} לא נמצא.`);
    return;
  }

  if (session.mode === 'HUMAN' && session.assignedAgentWa === agentPhone) {
    await WhatsAppProvider.sendText(agentPhone, `כבר יש לך שליטה על סשן ${shortId}.`);
    return;
  }

  await prisma.chatSession.update({
    where: { id: session.id },
    data: {
      mode: 'HUMAN',
      status: 'OPEN',
      assignedAgentWa: agentPhone,
      modeLockUntil: new Date(Date.now() + 5000),
    },
  });

  // Notify customer via Socket.io
  const io = getIO();
  io.to(`session:${session.id}`).emit('mode_changed', { mode: 'HUMAN' });

  // Save system message
  await ChatService.saveMessage({
    sessionId: session.id,
    text: 'נציג הצטרף לשיחה.',
    sender: 'SYSTEM',
    channel: 'WEB',
  });

  const sid = session.id.slice(-8);

  // Confirm to agent
  await WhatsAppProvider.sendText(
    agentPhone,
    `✅ קיבלת שליטה על סשן ${sid}.\nשלח הודעות בפורמט:\n${sid}: ההודעה שלך`,
  );

  broadcastToAdmins('session_taken', {
    sessionId: session.id,
    agentPhone,
  });
}

// ─── /release <shortId> ───────────────────────────────────

async function handleReleaseCommand(shortId: string, agentPhone: string): Promise<void> {
  const session = await resolveSession(shortId);
  if (!session) {
    await WhatsAppProvider.sendText(agentPhone, `❌ סשן ${shortId} לא נמצא.`);
    return;
  }

  if (session.mode !== 'HUMAN' || session.assignedAgentWa !== agentPhone) {
    await WhatsAppProvider.sendText(agentPhone, `אין לך שליטה על סשן ${shortId}.`);
    return;
  }

  await prisma.chatSession.update({
    where: { id: session.id },
    data: {
      mode: 'AI',
      assignedAgentWa: null,
      assignedAgentName: null,
      modeLockUntil: new Date(Date.now() + 5000),
    },
  });

  const io = getIO();
  io.to(`session:${session.id}`).emit('mode_changed', { mode: 'AI' });

  await ChatService.saveMessage({
    sessionId: session.id,
    text: 'הנציג עזב את השיחה. העוזר החכם ימשיך מכאן.',
    sender: 'SYSTEM',
    channel: 'WEB',
  });

  await WhatsAppProvider.sendText(agentPhone, `✅ שחררת סשן ${session.id.slice(-8)}. AI חזר לפעולה.`);

  broadcastToAdmins('session_released', { sessionId: session.id });
}

// ─── Agent message: <shortId>: <message> ──────────────────

async function handleAgentMessage(
  shortId: string,
  messageText: string,
  agentPhone: string,
  externalId: string,
): Promise<void> {
  const session = await resolveSession(shortId);
  if (!session) {
    await WhatsAppProvider.sendText(agentPhone, `❌ סשן ${shortId} לא נמצא.`);
    return;
  }

  if (session.mode !== 'HUMAN') {
    await WhatsAppProvider.sendText(
      agentPhone,
      `סשן ${shortId} במצב AI. שלח /take ${shortId} כדי לקחת שליטה.`,
    );
    return;
  }

  // Save agent message to DB
  const agentMsg = await ChatService.saveMessage({
    sessionId: session.id,
    text: messageText,
    sender: 'AGENT',
    channel: 'WHATSAPP',
    waMessageId: externalId,
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

  // Mirror agent message to email thread
  if (env.AGENT_EMAIL) {
    EmailService.sendChatMessageEmail({
      to: env.AGENT_EMAIL,
      sessionId: session.id,
      text: messageText,
      sender: 'AGENT',
      emailMessageId: session.emailMessageId,
    }).catch((err) => console.error('[Orchestration] Agent email mirror failed:', err));
  }
}

// ─── Unstructured message fallback ────────────────────────

async function handleUnstructuredMessage(
  agentPhone: string,
  text: string,
  externalId: string,
): Promise<void> {
  // Find sessions where this agent is actively assigned
  const activeSessions = await prisma.chatSession.findMany({
    where: {
      assignedAgentWa: agentPhone,
      mode: 'HUMAN',
      status: { in: ['OPEN', 'PENDING_HUMAN'] },
    },
  });

  if (activeSessions.length === 1) {
    // Single active session — route message there
    await handleAgentMessage(
      activeSessions[0].id.slice(-8),
      text,
      agentPhone,
      externalId,
    );
  } else if (activeSessions.length > 1) {
    const sessionList = activeSessions
      .map((s) => `  ${s.id.slice(-8)}`)
      .join('\n');
    await WhatsAppProvider.sendText(
      agentPhone,
      `יש לך ${activeSessions.length} סשנים פעילים. ציין:\n<sessionId>: הודעה\n\nסשנים פעילים:\n${sessionList}`,
    );
  }
  // 0 sessions → ignore (normal WA message not meant for the bot)
}
