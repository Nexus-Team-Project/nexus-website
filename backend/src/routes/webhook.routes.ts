import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { hmacSha256 } from '../utils/crypto';
import * as PaymentService from '../services/payment.service';
import * as OrchestrationService from '../services/orchestration.service';
import * as ChatService from '../services/chat.service';
import * as GreenApi from '../services/greenapi.service';
import { getIO } from '../socket';

const router = Router();

// ─── Idempotency helpers ─────────────────────────────────

async function isProcessed(externalId: string): Promise<boolean> {
  const existing = await prisma.webhookLog.findUnique({ where: { externalId } });
  return !!existing;
}

async function markProcessed(externalId: string, source: string): Promise<void> {
  await prisma.webhookLog
    .create({ data: { externalId, source } })
    .catch(() => {}); // Ignore duplicate key race condition
}

// ─── GET /api/webhooks/whatsapp — Meta verification ────────

router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] WhatsApp verification OK');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// ─── POST /api/webhooks/whatsapp — Meta inbound messages ──

router.post('/whatsapp', async (req: Request, res: Response) => {
  // HMAC verification (raw body preserved by express.raw middleware)
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = req.body as Buffer;

  if (signature && env.WHATSAPP_APP_SECRET) {
    const expected = `sha256=${hmacSha256(env.WHATSAPP_APP_SECRET, rawBody)}`;
    if (expected !== signature) {
      console.warn('[Webhook] HMAC mismatch');
      res.status(403).send('Invalid signature');
      return;
    }
  }

  // Always respond 200 immediately (Meta requires <5s)
  res.status(200).send('OK');

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return;
  }

  // Process each entry
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      // Handle incoming messages — route through orchestration
      // Extract contact names for display
      const contacts = value.contacts ?? [];
      const contactMap: Record<string, string> = {};
      for (const c of contacts) {
        if (c.wa_id && c.profile?.name) contactMap[c.wa_id] = c.profile.name;
      }

      for (const msg of value.messages ?? []) {
        const externalId = msg.id as string;
        if (await isProcessed(externalId)) continue;
        await markProcessed(externalId, 'meta');

        const from = msg.from as string;
        const senderName = contactMap[from] || undefined;
        let text = '';
        let mediaUrl: string | undefined;
        let mediaType: string | undefined;
        let fileName: string | undefined;

        switch (msg.type) {
          case 'text':
            text = msg.text?.body ?? '';
            break;
          case 'image':
            text = msg.image?.caption ?? '';
            mediaType = 'image';
            break;
          case 'video':
            text = msg.video?.caption ?? '';
            mediaType = 'video';
            break;
          case 'audio':
            mediaType = 'audio';
            break;
          case 'document':
            text = msg.document?.caption ?? '';
            mediaType = 'document';
            fileName = msg.document?.filename;
            break;
          default:
            continue;
        }

        if (!text && !mediaType) continue;

        await OrchestrationService.handleIncomingWhatsAppMessage({
          from, text: text || '', externalId, senderName, mediaUrl, mediaType, fileName,
        });
      }

      // Handle message status updates (delivered, read, etc.)
      for (const status of value.statuses ?? []) {
        console.log(`[Webhook] Status update: ${status.id} → ${status.status}`);
      }
    }
  }
});

// ─── POST /api/webhooks/greenapi — Green API inbound ──────

router.post('/greenapi', async (req: Request, res: Response) => {
  // Always respond 200 immediately
  res.status(200).send('OK');

  let payload: any;
  try {
    const rawBody = req.body as Buffer;
    payload = JSON.parse(rawBody.toString());
  } catch {
    return;
  }

  const webhookType = payload.typeWebhook as string;

  // Process incoming messages + outgoing messages from phone (full WhatsApp inbox)
  const isIncoming = webhookType === 'incomingMessageReceived';
  const isOutgoing = webhookType === 'outgoingMessage'
    || webhookType === 'outgoingMessageReceived'
    || webhookType === 'outgoingAPIMessageReceived';
  if (!isIncoming && !isOutgoing) return;

  // ── Robust chatId extraction for outgoing messages ──
  // Green API puts chatId in different places depending on webhook type:
  //   - top-level payload.chatId (outgoingMessage / outgoingAPIMessageReceived)
  //   - payload.senderData.chatId (outgoingMessageReceived — sent from phone)
  const outgoingRecipient =
    (payload.chatId as string)
    ?? (payload.senderData?.chatId as string)
    ?? '';

  const externalId = payload.idMessage as string;
  const from = isIncoming
    ? (payload.senderData?.sender?.replace('@c.us', '') ?? '')
    : outgoingRecipient.replace('@c.us', '');
  const senderName = isIncoming
    ? (payload.senderData?.senderName ?? '')
    : '';
  const msgData = payload.messageData;
  const msgType = (msgData?.typeMessage as string) ?? '';

  console.log(
    `[Webhook/GreenAPI] type=${webhookType} ` +
    `${isIncoming ? 'from' : 'to'}=${from} ` +
    `msgType=${msgType} ` +
    `id=${externalId} ` +
    `rawChatId=${payload.chatId ?? 'N/A'} ` +
    `senderData.chatId=${payload.senderData?.chatId ?? 'N/A'} ` +
    `senderData.sender=${payload.senderData?.sender ?? 'N/A'}`,
  );

  if (!externalId || !from) {
    console.warn(`[Webhook/GreenAPI] DROPPED — missing externalId=${externalId} or from=${from}`);
    return;
  }

  if (await isProcessed(externalId)) {
    console.log(`[Webhook/GreenAPI] DEDUP — already processed ${externalId}`);
    return;
  }
  await markProcessed(externalId, 'green_api');

  // ── Extract text and media depending on message type ──
  let text = '';
  let mediaUrl: string | undefined;
  let mediaType: string | undefined;
  let fileName: string | undefined;

  switch (msgType) {
    case 'textMessage':
      text = msgData?.textMessageData?.textMessage ?? '';
      break;
    case 'extendedTextMessage':
      text = msgData?.extendedTextMessageData?.text ?? '';
      break;
    case 'quotedMessage':
      // Reply / quote — text lives in extendedTextMessageData or textMessageData
      text = msgData?.extendedTextMessageData?.text
        ?? msgData?.textMessageData?.textMessage
        ?? msgData?.quotedMessage?.caption
        ?? '';
      break;
    case 'imageMessage':
      text = msgData?.imageMessage?.caption ?? '';
      mediaUrl = msgData?.downloadUrl ?? msgData?.imageMessage?.downloadUrl;
      mediaType = 'image';
      break;
    case 'videoMessage':
      text = msgData?.videoMessage?.caption ?? '';
      mediaUrl = msgData?.downloadUrl ?? msgData?.videoMessage?.downloadUrl;
      mediaType = 'video';
      break;
    case 'audioMessage':
      mediaUrl = msgData?.downloadUrl ?? msgData?.audioMessage?.downloadUrl;
      mediaType = 'audio';
      break;
    case 'documentMessage':
      text = msgData?.documentMessage?.caption ?? '';
      mediaUrl = msgData?.downloadUrl ?? msgData?.documentMessage?.downloadUrl;
      mediaType = 'document';
      fileName = msgData?.documentMessage?.fileName ?? msgData?.fileMessageData?.fileName;
      break;
    case 'stickerMessage':
      text = '🏷️';  // Sticker placeholder
      break;
    case 'contactMessage':
    case 'contactsArrayMessage':
      text = '👤 איש קשר';
      break;
    case 'locationMessage':
      text = `📍 מיקום: ${msgData?.locationMessageData?.latitude ?? ''},${msgData?.locationMessageData?.longitude ?? ''}`;
      break;
    case 'listResponseMessage':
    case 'buttonsResponseMessage':
    case 'templateButtonReplyMessage':
      text = msgData?.listResponseMessageData?.title
        ?? msgData?.buttonsResponseMessageData?.selectedButtonId
        ?? msgData?.templateButtonReplyMessage?.selectedId
        ?? JSON.stringify(msgData).slice(0, 200);
      break;
    case 'reactionMessage':
      // Reactions — skip silently (not a real message)
      return;
    default:
      // Unknown type — log full payload for debugging but don't drop
      console.warn(
        `[Webhook/GreenAPI] Unknown msgType="${msgType}" — attempting text extraction. ` +
        `Keys: ${Object.keys(msgData ?? {}).join(', ')}`,
      );
      // Try to extract text from common patterns
      text = msgData?.textMessageData?.textMessage
        ?? msgData?.extendedTextMessageData?.text
        ?? msgData?.caption
        ?? '';
      if (!text) {
        console.warn(`[Webhook/GreenAPI] Could not extract text for msgType="${msgType}", skipping`);
        return;
      }
      break;
  }

  if (!text && !mediaUrl) {
    console.log(`[Webhook/GreenAPI] DROPPED — no text or media for ${externalId}`);
    return;
  }

  // ── Route: outgoing vs incoming ──
  if (isOutgoing) {
    console.log(`[Webhook/GreenAPI] → handleOutgoingWhatsAppMessage to=${from} text="${(text || '').slice(0, 60)}"`);
    await OrchestrationService.handleOutgoingWhatsAppMessage({
      to: from, // 'from' here is actually the recipient for outgoing
      text: text || '',
      externalId,
      mediaUrl,
      mediaType,
      fileName,
    });
    return;
  }

  console.log(`[Webhook/GreenAPI] → handleIncomingWhatsAppMessage from=${from} text="${(text || '').slice(0, 60)}"`);
  await OrchestrationService.handleIncomingWhatsAppMessage({
    from,
    text: text || '',
    externalId,
    senderName: senderName || undefined,
    mediaUrl,
    mediaType,
    fileName,
  });
});

// ─── GET /api/webhooks/greenapi/settings — Check & fix Green API settings ──

router.get('/greenapi/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await GreenApi.getSettings();
    if (!settings) {
      res.status(503).json({ error: 'Green API not configured or unreachable' });
      return;
    }

    const issues: string[] = [];
    if (!settings.outgoingWebhook) issues.push('outgoingWebhook is OFF');
    if (!settings.outgoingMessageWebhook) issues.push('outgoingMessageWebhook is OFF');
    if (!settings.outgoingAPIMessageWebhook) issues.push('outgoingAPIMessageWebhook is OFF');
    if (!settings.incomingWebhook) issues.push('incomingWebhook is OFF');
    if (!settings.webhookUrl) issues.push('webhookUrl is not set');

    res.json({
      ok: issues.length === 0,
      issues,
      settings: {
        webhookUrl: settings.webhookUrl,
        incomingWebhook: settings.incomingWebhook,
        outgoingWebhook: settings.outgoingWebhook,
        outgoingMessageWebhook: settings.outgoingMessageWebhook,
        outgoingAPIMessageWebhook: settings.outgoingAPIMessageWebhook,
        stateWebhook: settings.stateWebhook,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check settings' });
  }
});

// ─── POST /api/webhooks/greenapi/fix-settings — Auto-fix Green API settings ──

router.post('/greenapi/fix-settings', async (req: Request, res: Response) => {
  try {
    // Determine webhook URL from request or env
    let rawBody: any;
    try {
      rawBody = req.body instanceof Buffer ? JSON.parse(req.body.toString()) : req.body;
    } catch {
      rawBody = {};
    }
    const webhookUrl = rawBody?.webhookUrl
      || `${env.FRONTEND_URL}/api/webhooks/greenapi`;

    const result = await GreenApi.ensureOutgoingWebhooksEnabled(webhookUrl);
    res.json({
      ok: true,
      changed: result.changed,
      settings: result.settings ? {
        webhookUrl: result.settings.webhookUrl,
        incomingWebhook: result.settings.incomingWebhook,
        outgoingWebhook: result.settings.outgoingWebhook,
        outgoingMessageWebhook: result.settings.outgoingMessageWebhook,
        outgoingAPIMessageWebhook: result.settings.outgoingAPIMessageWebhook,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fix settings' });
  }
});

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
