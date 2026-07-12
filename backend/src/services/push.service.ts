/**
 * Web Push Notification Service
 *
 * Sends browser push notifications to subscribed admin/agent devices.
 * Uses VAPID protocol — requires VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY env vars.
 *
 * Generate keys once with: npx web-push generate-vapid-keys
 */

import webpush from 'web-push';
import { prisma } from '../config/database';
import { env } from '../config/env';

// ─── Initialize VAPID ────────────────────────────────────

const isConfigured = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (isConfigured) {
  webpush.setVapidDetails(
    `mailto:${env.AGENT_EMAIL || 'admin@nexus-payment.com'}`,
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  );
  console.log('[Push] Web Push configured with VAPID keys');
} else {
  console.warn('[Push] VAPID keys not set — push notifications disabled. Run: npx web-push generate-vapid-keys');
}

// ─── Subscribe ───────────────────────────────────────────

export async function subscribe(userId: string, subscription: webpush.PushSubscription): Promise<void> {
  const endpoint = subscription.endpoint;

  // Upsert subscription — one per endpoint
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh: subscription.keys?.p256dh ?? '',
      auth: subscription.keys?.auth ?? '',
    },
    update: {
      userId,
      p256dh: subscription.keys?.p256dh ?? '',
      auth: subscription.keys?.auth ?? '',
    },
  });
}

// ─── Unsubscribe ─────────────────────────────────────────

export async function unsubscribe(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

// ─── Send push to all subscriptions ──────────────────────

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<number> {
  if (!isConfigured) return 0;

  const subs = await prisma.pushSubscription.findMany();
  if (subs.length === 0) return 0;

  const data = JSON.stringify(payload);
  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        data,
      );
      sent++;
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      // 410 Gone = subscription expired, clean up
      if (e.statusCode === 410 || e.statusCode === 404) {
        await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
      } else {
        console.error(`[Push] Failed to send to ${sub.endpoint.slice(-20)}:`, e.message);
      }
    }
  }

  return sent;
}

// ─── Convenience: send chat notification ─────────────────

export async function notifyNewChatMessage(params: {
  sessionId: string;
  senderName: string;
  text: string;
}): Promise<void> {
  if (!isConfigured) return;

  await sendPushToAll({
    title: `הודעה חדשה מ-${params.senderName}`,
    body: params.text.slice(0, 120),
    url: `/admin/inbox`,
    tag: `chat-${params.sessionId}`,
  });
}

export async function notifyNewLead(params: {
  name: string;
  email?: string;
}): Promise<void> {
  if (!isConfigured) return;

  await sendPushToAll({
    title: 'ליד חדש!',
    body: `${params.name}${params.email ? ` (${params.email})` : ''}`,
    url: '/admin',
    tag: 'new-lead',
  });
}

export const pushService = {
  isConfigured,
  subscribe,
  unsubscribe,
  sendPushToAll,
  notifyNewChatMessage,
  notifyNewLead,
};
