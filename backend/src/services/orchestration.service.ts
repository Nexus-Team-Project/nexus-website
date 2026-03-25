import { prisma } from '../config/database';
import { env } from '../config/env';
import * as ChatService from './chat.service';
import * as WhatsAppProvider from './whatsapp-provider';
import { getIO, broadcastToAdmins } from '../socket';

// ─── Command Parsing ─────────────────────────────────────

type WhatsAppCommand =
  | { type: 'take'; sessionId: string }
  | { type: 'release'; sessionId: string }
  | { type: 'message'; sessionId: string; messageText: string }
  | { type: 'unknown' };

export function parseWhatsAppCommand(text: string): WhatsAppCommand {
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

// ─── Helper: check if sender is the agent ─────────────────

function isAgentPhone(phone: string): boolean {
  if (!env.AGENT_WHATSAPP_NUMBER) return false;
  const normalize = (p: string) => {
    const digits = p.replace(/[^0-9]/g, '');
    // Convert Israeli local format 0XX → 972XX
    if (digits.startsWith('0') && digits.length === 10) return '972' + digits.slice(1);
    return digits;
  };
  const result = normalize(phone) === normalize(env.AGENT_WHATSAPP_NUMBER);
  console.log(`[Orchestration] isAgentPhone(${phone}) env=${env.AGENT_WHATSAPP_NUMBER} → ${result}`);
  return result;
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
  senderName?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}): Promise<void> {
  // ── Agent messages: commands (/take, /release) or routed to sessions
  if (isAgentPhone(data.from)) {
    const command = parseWhatsAppCommand(data.text);
    switch (command.type) {
      case 'take':
        await handleTakeCommand(command.sessionId, data.from);
        return;
      case 'release':
        await handleReleaseCommand(command.sessionId, data.from);
        return;
      case 'message':
        await handleAgentMessage(command.sessionId, command.messageText!, data.from, data.externalId);
        return;
      case 'unknown':
        await handleUnstructuredMessage(data.from, data.text, data.externalId);
        return;
    }
  }

  // ── Customer / external contact messages → route to WhatsApp inbox
  await handleCustomerWhatsAppMessage(data);
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

  await WhatsAppProvider.sendText(
    agentPhone,
    `✅ שחררת סשן ${session.id.slice(-8)}. AI חזר לפעולה.`,
  );

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
    // Auto-take the session from WhatsApp instead of rejecting
    await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        mode: 'HUMAN',
        status: 'OPEN',
        assignedAgentWa: agentPhone,
        modeLockUntil: new Date(Date.now() + 5000),
      },
    });
    const io2 = getIO();
    io2.to(`session:${session.id}`).emit('mode_changed', { mode: 'HUMAN' });
    await ChatService.saveMessage({
      sessionId: session.id,
      text: 'נציג הצטרף לשיחה.',
      sender: 'SYSTEM',
      channel: 'WEB',
    });
  }

  // Auto-link WhatsApp number if not set
  if (!session.assignedAgentWa) {
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { assignedAgentWa: agentPhone },
    });
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

  // Forward agent reply to customer on WhatsApp
  if (session.waThreadId) {
    try {
      const waId = await WhatsAppProvider.sendText(session.waThreadId, messageText);
      // Pre-register the outgoing message ID to prevent duplicate processing
      // when Green API fires the outgoing webhook for this sent message
      if (waId) {
        await prisma.webhookLog.create({
          data: { externalId: waId, source: 'agent_forward', processedAt: new Date() },
        }).catch(() => {}); // Ignore duplicate key
      }
      console.log(`[Orchestration] Forwarded agent reply to WhatsApp ${session.waThreadId} (waId=${waId})`);
    } catch (err) {
      console.error(`[Orchestration] Failed to forward to WhatsApp:`, err);
    }
  }
}

// ─── Unstructured message fallback ────────────────────────

async function handleUnstructuredMessage(
  agentPhone: string,
  text: string,
  externalId: string,
): Promise<void> {
  // Find sessions where this agent is actively assigned via WhatsApp
  let activeSessions = await prisma.chatSession.findMany({
    where: {
      assignedAgentWa: agentPhone,
      mode: 'HUMAN',
      status: { in: ['OPEN', 'PENDING_HUMAN'] },
    },
  });

  // Also include sessions taken from the web UI (assignedAgentWa is null)
  // if the sender is the configured AGENT_WHATSAPP_NUMBER
  if (activeSessions.length === 0 && isAgentPhone(agentPhone)) {
    activeSessions = await prisma.chatSession.findMany({
      where: {
        mode: 'HUMAN',
        status: { in: ['OPEN', 'PENDING_HUMAN'] },
        assignedAgentWa: null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Auto-link the WhatsApp number to these sessions
    if (activeSessions.length > 0) {
      await prisma.chatSession.updateMany({
        where: { id: { in: activeSessions.map((s) => s.id) } },
        data: { assignedAgentWa: agentPhone },
      });
    }
  }

  if (activeSessions.length === 1) {
    // Single active session — route message there
    await handleAgentMessage(activeSessions[0].id.slice(-8), text, agentPhone, externalId);
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

// ─── Customer WhatsApp Message → auto-create/find session ─

async function handleCustomerWhatsAppMessage(data: {
  from: string;
  text: string;
  externalId: string;
  senderName?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}): Promise<void> {
  const waContactId = data.from.replace('@c.us', '');

  // 1. Find existing open session for this WhatsApp contact
  let session = await prisma.chatSession.findFirst({
    where: {
      waThreadId: waContactId,
      status: { in: ['OPEN', 'PENDING_HUMAN'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // 2. If no open session, create a new one
  if (!session) {
    const contactName = data.senderName || waContactId;
    session = await prisma.chatSession.create({
      data: {
        visitorId: `wa_${waContactId}`,
        waThreadId: waContactId,
        status: 'OPEN',
        mode: 'HUMAN', // WhatsApp conversations start in HUMAN mode
        subject: contactName,
        metadata: {
          channel: 'whatsapp',
          contactPhone: waContactId,
          contactName: data.senderName || null,
        },
      },
    });

    console.log(`[Orchestration] New WhatsApp session created: ${session.id} for ${waContactId}`);
  }

  // 3. Save the customer message
  const msg = await ChatService.saveMessage({
    sessionId: session.id,
    text: data.text || (data.fileName ? `📎 ${data.fileName}` : '📎 מדיה'),
    sender: 'CUSTOMER',
    channel: 'WHATSAPP',
    waMessageId: data.externalId,
    mediaUrl: data.mediaUrl,
    mediaType: data.mediaType,
    fileName: data.fileName,
  });

  // 4. Touch updatedAt on session
  await prisma.chatSession.update({
    where: { id: session.id },
    data: { updatedAt: new Date() },
  });

  // 5. Broadcast to admin dashboard via Socket.io
  const io = getIO();
  io.to(`session:${session.id}`).emit('new_message', {
    id: msg.id,
    text: msg.text,
    sender: msg.sender,
    channel: msg.channel,
    timestamp: msg.createdAt,
    mediaUrl: msg.mediaUrl,
    mediaType: msg.mediaType,
    fileName: msg.fileName,
  });

  // Also broadcast session update so admin sidebar refreshes
  broadcastToAdmins('session_updated', {
    sessionId: session.id,
    waThreadId: waContactId,
    lastMessage: msg.text.slice(0, 100),
    timestamp: msg.createdAt,
    senderName: data.senderName,
  });

  // 6. Notify agent on WhatsApp about new customer message
  const shortId = session.id.slice(-8);
  const contactLabel = data.senderName || waContactId;
  const preview = data.text ? data.text.slice(0, 200) : '📎 מדיה';
  await WhatsAppProvider.notifyAgent(
    `💬 *הודעה חדשה מ-${contactLabel}*\nסשן: ${shortId}\n\n${preview}\n\n👉 להשיב:\n${shortId}: ההודעה שלך`,
  ).catch(console.error);
}

// ─── Outgoing WhatsApp Message (sent from phone) ──────────

export async function handleOutgoingWhatsAppMessage(data: {
  to: string;
  text: string;
  externalId: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}): Promise<void> {
  const waContactId = data.to.replace('@c.us', '');

  // Skip messages sent to the agent's own number (self-notifications from the system)
  if (isAgentPhone(waContactId)) {
    console.log(`[Orchestration] Outgoing to self (agent), skipping`);
    return;
  }

  console.log(`[Orchestration] handleOutgoingWhatsAppMessage to=${waContactId} text="${(data.text || '').slice(0, 60)}"`);

  // Find existing open session for this WhatsApp contact
  let session = await prisma.chatSession.findFirst({
    where: {
      waThreadId: waContactId,
      status: { in: ['OPEN', 'PENDING_HUMAN'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Also try RESOLVED sessions if no open session found (agent might re-engage)
  if (!session) {
    session = await prisma.chatSession.findFirst({
      where: {
        waThreadId: waContactId,
        status: 'RESOLVED',
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (session) {
      // Re-open the resolved session
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: 'OPEN', mode: 'HUMAN' },
      });
      console.log(`[Orchestration] Re-opened RESOLVED session ${session.id} for outgoing msg`);
    }
  }

  // If no session at all, create a new one
  if (!session) {
    session = await prisma.chatSession.create({
      data: {
        visitorId: `wa_${waContactId}`,
        waThreadId: waContactId,
        status: 'OPEN',
        mode: 'HUMAN',
        subject: waContactId,
        metadata: {
          channel: 'whatsapp',
          contactPhone: waContactId,
        },
      },
    });
    console.log(`[Orchestration] New outgoing WhatsApp session: ${session.id} for ${waContactId}`);
  }

  // Save as AGENT message (sent by the agent from their phone)
  const msg = await ChatService.saveMessage({
    sessionId: session.id,
    text: data.text || (data.fileName ? `📎 ${data.fileName}` : '📎 מדיה'),
    sender: 'AGENT',
    channel: 'WHATSAPP',
    waMessageId: data.externalId,
    mediaUrl: data.mediaUrl,
    mediaType: data.mediaType,
    fileName: data.fileName,
  });

  await prisma.chatSession.update({
    where: { id: session.id },
    data: { updatedAt: new Date() },
  });

  // Broadcast to admin dashboard
  const io = getIO();
  io.to(`session:${session.id}`).emit('new_message', {
    id: msg.id,
    text: msg.text,
    sender: msg.sender,
    channel: msg.channel,
    timestamp: msg.createdAt,
    mediaUrl: msg.mediaUrl,
    mediaType: msg.mediaType,
    fileName: msg.fileName,
  });

  broadcastToAdmins('session_updated', {
    sessionId: session.id,
    waThreadId: waContactId,
    lastMessage: msg.text.slice(0, 100),
    timestamp: msg.createdAt,
  });

  console.log(`[Orchestration] Outgoing msg saved to session ${session.id.slice(-8)} (${msg.id})`);
}
