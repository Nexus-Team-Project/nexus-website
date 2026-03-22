import { prisma } from '../config/database';
import * as WhatsApp from './whatsapp-provider';
import * as MondayService from './monday.service';
import * as EmailService from './email.service';
import { broadcastToAdmins } from '../socket';
import * as AnalyticsService from './analytics.service';
import { env } from '../config/env';

// ─── Visitor arrived on site ──────────────────────────────

export async function handleVisitorArrival(data: {
  visitorId: string;
  page: string;
  country?: string;
}): Promise<void> {
  // Only notify for new visitors or first visit of the day
  const isNew = await AnalyticsService.isNewVisitorToday(data.visitorId);
  if (!isNew) return;

  const profile = await prisma.visitorProfile.findUnique({
    where: { visitorId: data.visitorId },
  });
  const apolloData = profile?.apolloData as {
    name?: string; company?: string; title?: string; email?: string;
  } | null;

  const title = apolloData?.name
    ? `מבקר חדש: ${apolloData.name} (${apolloData.company ?? ''})`
    : `מבקר חדש — ${data.page}`;

  const body = `דף: ${data.page}${data.country ? ` | ${data.country}` : ''}`;

  // 1. Save notification to DB
  const notification = await prisma.notification.create({
    data: {
      type: 'visitor_arrived',
      title,
      body,
      metadata: { ...data, apolloData },
    },
  });

  // 2. Broadcast to all admin dashboard clients via Socket.io
  broadcastToAdmins('visitor_arrived', {
    id: notification.id,
    visitorId: data.visitorId,
    page: data.page,
    country: data.country,
    apolloData,
    timestamp: notification.createdAt,
  });

  // 3. Send WhatsApp notification to agent
  const waMsg = WhatsApp.formatVisitorAlert({
    page: data.page,
    country: data.country,
    visitorId: data.visitorId,
    apolloData,
  });
  await WhatsApp.notifyAgent(waMsg);
}

// ─── Chat session opened ──────────────────────────────────

export async function handleChatOpened(data: {
  sessionId: string;
  visitorId: string;
  page?: string;
}): Promise<void> {
  const profile = await prisma.visitorProfile.findUnique({
    where: { visitorId: data.visitorId },
  });
  const apolloData = profile?.apolloData as {
    name?: string; company?: string; title?: string; email?: string;
  } | null;

  const title = apolloData?.name
    ? `צ'אט נפתח: ${apolloData.name}`
    : `צ'אט חדש נפתח`;

  const notification = await prisma.notification.create({
    data: {
      type: 'chat_opened',
      title,
      body: data.page ? `דף: ${data.page}` : undefined,
      metadata: { ...data, apolloData },
    },
  });

  // Update visitor profile chat count
  await prisma.visitorProfile.upsert({
    where: { visitorId: data.visitorId },
    create: { visitorId: data.visitorId, chatCount: 1 },
    update: { chatCount: { increment: 1 } },
  });

  // Socket.io
  broadcastToAdmins('chat_opened', {
    id: notification.id,
    sessionId: data.sessionId,
    visitorId: data.visitorId,
    page: data.page,
    apolloData,
    timestamp: notification.createdAt,
  });

  // WhatsApp
  const waMsg = WhatsApp.formatChatOpenedAlert({
    sessionId: data.sessionId,
    page: data.page,
    apolloData,
  });
  await WhatsApp.notifyAgent(waMsg);
}

// ─── Chat escalated to human ──────────────────────────────

export async function handleChatEscalated(data: {
  sessionId: string;
  topic?: string;
  leadData?: Record<string, string>;
  recentMessages?: Array<{ sender: string; text: string }>;
  page?: string;
}): Promise<void> {
  const topicLabels: Record<string, string> = {
    sales: 'מכירות', technical: 'טכני', billing: 'חיוב', general: 'כללי',
  };
  const topicLabel = topicLabels[data.topic ?? 'general'] ?? 'כללי';
  const shortId = data.sessionId.slice(-8);

  // Build enriched notification body
  let body = `סשן: ${shortId}\nנושא: ${topicLabel}`;
  if (data.page) body += `\nעמוד: ${data.page}`;
  if (data.leadData) {
    const ld = data.leadData;
    if (ld.name) body += `\n${ld.name}`;
    if (ld.company) body += ` | ${ld.company}`;
    if (ld.email) body += `\n${ld.email}`;
    if (ld.phone) body += `\n${ld.phone}`;
  }

  const notification = await prisma.notification.create({
    data: {
      type: 'chat_escalated',
      title: `צ'אט דורש נציג - ${topicLabel}`,
      body,
      metadata: data,
    },
  });

  broadcastToAdmins('chat_escalated', {
    id: notification.id,
    sessionId: data.sessionId,
    topic: data.topic,
    leadData: data.leadData,
    timestamp: notification.createdAt,
  });

  // ─── WhatsApp notification ─────────────────────────────

  let waMessage = `*העברה לנציג - ${topicLabel}*\n\n`;
  if (data.leadData) {
    const ld = data.leadData;
    if (ld.name || ld.company) waMessage += `${ld.name ?? ''}${ld.company ? ` | ${ld.company}` : ''}\n`;
    if (ld.email) waMessage += `${ld.email}\n`;
    if (ld.phone) waMessage += `${ld.phone}\n`;
  }
  if (data.page) waMessage += `עמוד: ${data.page}\n`;
  if (data.recentMessages && data.recentMessages.length > 0) {
    waMessage += `\n*הודעות אחרונות:*\n`;
    for (const msg of data.recentMessages) {
      const label = msg.sender === 'CUSTOMER' || msg.sender === 'לקוח' ? 'לקוח' : 'AI';
      waMessage += `${label}: ${msg.text}\n`;
    }
  }
  waMessage += `\nסשן: ${shortId}`;
  waMessage += `\n/take ${shortId}`;

  await WhatsApp.notifyAgent(waMessage);

  // ─── Email notification ────────────────────────────────

  if (env.AGENT_EMAIL) {
    EmailService.sendEscalationAlert({
      to: env.AGENT_EMAIL,
      sessionId: data.sessionId,
      topic: topicLabel,
      leadData: data.leadData,
      recentMessages: data.recentMessages,
      page: data.page,
    }).catch((err) => console.error('[Notification] Email alert failed:', err));
  }

  // ─── Monday.com CRM ────────────────────────────────────

  MondayService.createLead({
    name: data.leadData?.name ?? 'Chat Lead',
    email: data.leadData?.email,
    company: data.leadData?.company,
    phone: data.leadData?.phone,
    source: 'chat_escalation',
    sessionId: data.sessionId,
    topic: data.topic,
  }).catch(console.error);
}

// ─── Lead submitted ───────────────────────────────────────

export async function handleLeadSubmitted(data: {
  leadId: string;
  email?: string;
  fullName?: string;
  company?: string;
  phone?: string;
  message?: string;
}): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      type: 'lead_submitted',
      title: `ליד חדש: ${data.fullName ?? data.email ?? 'לא ידוע'}`,
      body: data.company ? `חברה: ${data.company}` : undefined,
      metadata: data,
    },
  });

  broadcastToAdmins('lead_submitted', {
    id: notification.id,
    leadId: data.leadId,
    email: data.email,
    fullName: data.fullName,
    company: data.company,
    timestamp: notification.createdAt,
  });

  const waMsg = WhatsApp.formatLeadAlert(data);
  await WhatsApp.notifyAgent(waMsg);
}

// ─── Get unread notifications ─────────────────────────────

export async function getUnreadNotifications(limit = 20) {
  return prisma.notification.findMany({
    where: { isRead: false },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function markNotificationsRead(ids: string[]) {
  await prisma.notification.updateMany({
    where: { id: { in: ids } },
    data: { isRead: true },
  });
}
