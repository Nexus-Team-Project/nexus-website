import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { prisma } from '../config/database';
import * as PaymentService from '../services/payment.service';
import * as ChatService from '../services/chat.service';
import { getIO } from '../socket';

const router = Router();

// ─── POST /api/webhooks/email-inbound — Agent email replies ─

router.post('/email-inbound', async (req: Request, res: Response) => {
  // Parse body (JSON — sent by Make.com / Zapier / any email-to-webhook service)
  let payload: EmailInboundPayload;
  try {
    const rawBody = req.body as Buffer;
    payload = JSON.parse(rawBody.toString()) as EmailInboundPayload;
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  // Verify secret
  if (env.INBOUND_EMAIL_SECRET && payload.secret !== env.INBOUND_EMAIL_SECRET) {
    res.status(403).json({ error: 'Invalid secret' });
    return;
  }

  const { subject, text, from } = payload;
  if (!subject || !text) {
    res.status(400).json({ error: 'Missing subject or text' });
    return;
  }

  // Extract session short ID from subject: [Chat-XXXXXXXX]
  const match = subject.match(/\[Chat-([a-zA-Z0-9]{6,})\]/);
  if (!match) {
    res.status(400).json({ error: 'No session ID found in subject' });
    return;
  }

  const shortId = match[1];

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
    res.status(404).json({ error: `Session ${shortId} not found` });
    return;
  }

  // Clean reply text — strip quoted email content
  const cleanText = stripEmailQuote(text);
  if (!cleanText.trim()) {
    res.status(400).json({ error: 'Empty reply after stripping quotes' });
    return;
  }

  // Auto-take session if not already in HUMAN mode
  if (session.mode !== 'HUMAN') {
    await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        mode: 'HUMAN',
        status: 'OPEN',
        assignedAgentName: from ?? 'Agent',
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
    text: cleanText,
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

  console.log(`[EmailInbound] Agent reply routed to session ${shortId}: "${cleanText.slice(0, 80)}..."`);
  res.status(200).json({ ok: true, sessionId: session.id, messageId: agentMsg.id });
});

/**
 * Strip quoted email content from a reply.
 * Removes lines starting with ">", "On ... wrote:", Outlook-style headers, etc.
 */
function stripEmailQuote(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Outlook Hebrew quote markers
    if (trimmed.match(/^מאת:/)) break;
    if (trimmed.match(/^נשלח:/)) break;
    if (trimmed.match(/^אל:/)) break;

    // Outlook English quote markers
    if (trimmed.match(/^On .+ wrote:$/)) break;
    if (trimmed.match(/^-{3,}\s*Original Message/i)) break;
    if (trimmed.match(/^-{3,}\s*הודעה מקורית/i)) break;
    if (trimmed.match(/^_{3,}/)) break;
    if (trimmed.match(/^From:\s/i)) break;
    if (trimmed.match(/^Sent:\s/i)) break;

    // Skip quoted lines
    if (trimmed.startsWith('>')) continue;

    result.push(line);
  }

  return result.join('\n').trim();
}

// ─── POST /api/webhooks/payment — Stripe events ────────────

router.post('/payment', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;
  const rawBody = req.body as Buffer;

  if (!signature) {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  try {
    await PaymentService.handleStripeWebhook(rawBody, signature);
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] Stripe error:', err.message);
    res.status(err.statusCode ?? 400).json({ error: err.message });
  }
});

// ─── Type definitions ──────────────────────────────────────

interface EmailInboundPayload {
  secret?: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
}

export default router;
