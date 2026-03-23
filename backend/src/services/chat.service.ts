import { prisma } from '../config/database';
import { createError } from '../middleware/errorHandler';

// ─── Create session ────────────────────────────────────────

export async function createSession(data: {
  visitorId: string;
  userId?: string;
  page?: string;
  language?: string;
  userAgent?: string;
}) {
  return prisma.chatSession.create({
    data: {
      visitorId: data.visitorId,
      userId: data.userId,
      metadata: {
        page: data.page,
        language: data.language,
        userAgent: data.userAgent,
      },
    },
    select: {
      id: true,
      visitorId: true,
      status: true,
      mode: true,
      createdAt: true,
    },
  });
}

// ─── Get session ───────────────────────────────────────────

export async function getSession(sessionId: string) {
  return prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
  });
}

// ─── Get messages ──────────────────────────────────────────

export async function getMessages(sessionId: string, limit = 50) {
  return prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

// ─── Save message ──────────────────────────────────────────

export async function saveMessage(data: {
  sessionId: string;
  text: string;
  sender: 'CUSTOMER' | 'AI' | 'AGENT' | 'SYSTEM';
  channel?: 'WEB' | 'WHATSAPP' | 'EMAIL';
  waMessageId?: string;
  aiMetadata?: object;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}) {
  return prisma.chatMessage.create({
    data: {
      sessionId: data.sessionId,
      text: data.text,
      sender: data.sender,
      channel: data.channel ?? 'WEB',
      waMessageId: data.waMessageId,
      aiMetadata: data.aiMetadata ?? undefined,
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType,
      fileName: data.fileName,
    },
  });
}

// ─── Escalate to human ─────────────────────────────────────

export async function escalateSession(sessionId: string) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) throw createError('Session not found', 404);
  if (session.mode === 'HUMAN') return session; // Already escalated

  return prisma.chatSession.update({
    where: { id: sessionId },
    data: { mode: 'HUMAN', status: 'PENDING_HUMAN' },
  });
}

// ─── Close session ─────────────────────────────────────────

export async function closeSession(sessionId: string) {
  return prisma.chatSession.update({
    where: { id: sessionId },
    data: { status: 'CLOSED' },
  });
}

// ─── All sessions (admin/agent) ────────────────────────────

export async function getAllSessions(filter?: {
  status?: string;
  mode?: string;
  limit?: number;
}) {
  return prisma.chatSession.findMany({
    where: {
      ...(filter?.status && { status: filter.status as 'OPEN' | 'PENDING_HUMAN' | 'RESOLVED' | 'CLOSED' }),
      ...(filter?.mode && { mode: filter.mode as 'AI' | 'HUMAN' }),
    },
    orderBy: { updatedAt: 'desc' },
    take: filter?.limit ?? 50,
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
}

// ─── Link WhatsApp thread ──────────────────────────────────

export async function linkWhatsappThread(sessionId: string, waThreadId: string) {
  return prisma.chatSession.update({
    where: { id: sessionId },
    data: { waThreadId },
  });
}

// ─── Find session by WhatsApp thread ──────────────────────

export async function findSessionByWaThread(waThreadId: string) {
  return prisma.chatSession.findFirst({
    where: { waThreadId, status: { in: ['OPEN', 'PENDING_HUMAN'] } },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Upsert lead from AI chat conversation ────────────────

export async function upsertLeadFromChat(sessionId: string, leadData: Record<string, string>) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  // Accumulate lead data in session metadata
  const existingMeta = (session.metadata as Record<string, unknown>) ?? {};
  const existingLead = (existingMeta.leadData as Record<string, string>) ?? {};
  const mergedLead = { ...existingLead, ...leadData };

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { metadata: { ...existingMeta, leadData: mergedLead } },
  });

  // If we have an email, upsert the Lead record
  if (mergedLead.email) {
    await prisma.lead.upsert({
      where: { id: existingMeta.leadId as string ?? 'no-match' },
      create: {
        email: mergedLead.email,
        fullName: mergedLead.name,
        company: mergedLead.company,
        phone: mergedLead.phone,
        source: 'chat_ai',
        metadata: { sessionId, visitorId: session.visitorId },
      },
      update: {
        fullName: mergedLead.name ?? undefined,
        company: mergedLead.company ?? undefined,
        phone: mergedLead.phone ?? undefined,
        metadata: { sessionId, visitorId: session.visitorId },
      },
    });
  }
}

// ─── Update session metadata (Apollo enrichment) ──────────

export async function enrichSessionMetadata(sessionId: string, apolloData: object) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      metadata: {
        ...(session.metadata as object),
        apolloData,
      },
    },
  });
}
