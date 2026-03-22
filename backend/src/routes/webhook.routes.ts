import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { hmacSha256 } from '../utils/crypto';
import { prisma } from '../config/database';
import * as OrchestrationService from '../services/orchestration.service';
import * as PaymentService from '../services/payment.service';

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
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

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
  const signature = req.headers['x-hub-signature-256'] as string;
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

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(rawBody.toString()) as WhatsAppPayload;
  } catch {
    return;
  }

  // Process each entry
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      // Handle incoming messages — route through orchestration
      for (const msg of value.messages ?? []) {
        if (msg.type !== 'text') continue;

        const externalId = msg.id;

        // Idempotency check
        if (await isProcessed(externalId)) continue;
        await markProcessed(externalId, 'meta');

        const from = msg.from;
        const text = msg.text?.body ?? '';

        // Route through orchestration service
        await OrchestrationService.handleIncomingWhatsAppMessage({ from, text, externalId });
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

  let payload: GreenApiWebhookPayload;
  try {
    const rawBody = req.body as Buffer;
    payload = JSON.parse(rawBody.toString()) as GreenApiWebhookPayload;
  } catch {
    return;
  }

  // Only process incoming text messages
  if (payload.typeWebhook !== 'incomingMessageReceived') return;
  if (payload.messageData?.typeMessage !== 'textMessage') return;

  const externalId = payload.idMessage;
  const from = payload.senderData?.sender?.replace('@c.us', '') ?? '';
  const text = payload.messageData?.textMessageData?.textMessage ?? '';

  if (!externalId || !from || !text) return;

  // Idempotency check
  if (await isProcessed(externalId)) return;
  await markProcessed(externalId, 'green_api');

  // Route through orchestration service
  await OrchestrationService.handleIncomingWhatsAppMessage({ from, text, externalId });
});

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

interface WhatsAppPayload {
  entry?: Array<{
    changes?: Array<{
      value: {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          recipient_id: string;
        }>;
      };
    }>;
  }>;
}

interface GreenApiWebhookPayload {
  typeWebhook: string;
  instanceData?: { idInstance: number; wid: string };
  timestamp: number;
  idMessage: string;
  senderData?: {
    chatId: string;
    sender: string;
    chatName: string;
    senderName: string;
  };
  messageData?: {
    typeMessage: string;
    textMessageData?: { textMessage: string };
  };
}

export default router;
