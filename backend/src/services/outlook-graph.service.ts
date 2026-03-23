import { env } from '../config/env';

// ─── Microsoft Graph API — Shared utilities + outbound email ──
//
// Extracted from outlook-inbound.service.ts so both inbound polling
// and outbound email sending share the same auth/transport layer.

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

let cachedToken: { value: string; expiresAt: number } | null = null;

// ─── Feature gate ─────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.MS_MAILBOX);
}

export function getMailbox(): string {
  return encodeURIComponent(env.MS_MAILBOX!);
}

// ─── Auth ─────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch(TOKEN_URL(env.MS_TENANT_ID!), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.MS_CLIENT_ID!,
      client_secret: env.MS_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MS Graph auth failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

// ─── Graph API helpers ────────────────────────────────────────

export interface GraphMessage {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  body: { contentType: string; content: string };
  receivedDateTime: string;
  conversationId: string;
}

export async function graphGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function graphPatch(path: string, body: object): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PATCH ${path} failed: ${res.status} ${text}`);
  }
}

export async function graphPost<T>(path: string, body?: object): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const opts: RequestInit = { method: 'POST', headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${GRAPH_BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph POST ${path} failed: ${res.status} ${text}`);
  }
  // Some POST endpoints return 202 with no body (e.g., /send)
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return {} as T;
}

// ─── Outbound: Find email in inbox ────────────────────────────

/**
 * Search agent's inbox for an email matching [Chat-{shortId}] in subject.
 * Retries with backoff because SendPulse delivery may take a few seconds.
 */
export async function findEmailBySubject(
  shortId: string,
  afterTimestamp?: Date,
): Promise<GraphMessage | null> {
  if (!isConfigured()) return null;

  const mailbox = getMailbox();
  const retryDelays = [3000, 5000, 8000]; // ms

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, retryDelays[attempt - 1]));
    }

    try {
      let filter = `contains(subject,'[Chat-${shortId}]')`;
      if (afterTimestamp) {
        const isoTime = afterTimestamp.toISOString();
        filter += ` and receivedDateTime ge '${isoTime}'`;
      }

      const path = `/users/${mailbox}/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,conversationId,receivedDateTime,from,body&$top=1&$orderby=receivedDateTime desc`;
      const result = await graphGet<{ value: GraphMessage[] }>(path);

      if (result.value.length > 0) {
        console.log(`[OutlookGraph] Found email for [Chat-${shortId}] on attempt ${attempt + 1}`);
        return result.value[0];
      }
    } catch (err: any) {
      console.error(`[OutlookGraph] Search attempt ${attempt + 1} failed:`, err?.message);
    }
  }

  console.warn(`[OutlookGraph] Could not find email for [Chat-${shortId}] after ${retryDelays.length + 1} attempts`);
  return null;
}

/**
 * Get the most recent message in a conversation thread.
 */
export async function findLatestInConversation(
  conversationId: string,
): Promise<GraphMessage | null> {
  if (!isConfigured()) return null;

  const mailbox = getMailbox();
  const filter = encodeURIComponent(`conversationId eq '${conversationId}'`);
  const path = `/users/${mailbox}/messages?$filter=${filter}&$select=id,subject,conversationId,receivedDateTime,from,body&$orderby=receivedDateTime desc&$top=1`;

  const result = await graphGet<{ value: GraphMessage[] }>(path);
  return result.value[0] ?? null;
}

// ─── Outbound: Send reply from agent's mailbox ───────────────

/**
 * Creates a reply to an existing message and sends it FROM the agent's mailbox.
 * The reply appears in Sent Items and in the same thread as an outgoing message.
 *
 * Flow: createReply → PATCH body → send
 */
export async function sendReplyFromMailbox(
  messageId: string,
  htmlBody: string,
): Promise<string | null> {
  if (!isConfigured()) return null;

  const mailbox = getMailbox();

  // 1. Create reply draft
  const draft = await graphPost<{ id: string }>(
    `/users/${mailbox}/messages/${messageId}/createReply`,
  );

  if (!draft?.id) {
    throw new Error('createReply returned no draft ID');
  }

  // 2. Update draft body with our content
  await graphPatch(`/users/${mailbox}/messages/${draft.id}`, {
    body: {
      contentType: 'html',
      content: htmlBody,
    },
  });

  // 3. Send the draft
  await graphPost<Record<string, never>>(
    `/users/${mailbox}/messages/${draft.id}/send`,
  );

  console.log(`[OutlookGraph] Reply sent from mailbox, draftId: ${draft.id}`);
  return draft.id;
}

/**
 * Send a new email (not a reply) from the agent's mailbox.
 * Used as fallback when no existing thread exists.
 */
export async function sendNewEmailFromMailbox(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<string | null> {
  if (!isConfigured()) return null;

  const mailbox = getMailbox();

  // Create and send in one step
  const message = {
    subject,
    body: {
      contentType: 'html',
      content: htmlBody,
    },
    toRecipients: [
      {
        emailAddress: { address: to },
      },
    ],
  };

  await graphPost<Record<string, never>>(
    `/users/${mailbox}/sendMail`,
    { message, saveToSentItems: true },
  );

  console.log(`[OutlookGraph] New email sent from mailbox to ${to}`);
  return null; // sendMail doesn't return a message ID
}
