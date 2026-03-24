/**
 * Sales Agent Client — HTTP client that calls the nexus-agents sales API.
 *
 * Provides a thin wrapper around the nexus-agents Sales AI endpoints.
 * Returns `null` on any failure — callers fall back to local AiService.
 *
 * This ensures zero-downtime: if nexus-agents is unreachable, chat keeps working.
 */

import { env } from '../config/env';

const TIMEOUT_MS = 15_000; // 15 second timeout for AI reply

function isConfigured(): boolean {
  return Boolean(env.AGENT_API_URL && env.AGENT_API_KEY);
}

async function agentFetch<T>(path: string, body: unknown): Promise<T | null> {
  if (!isConfigured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${env.AGENT_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': env.AGENT_API_KEY!,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[SalesAgentClient] ${path} HTTP ${res.status}:`, await res.text().catch(() => ''));
      return null;
    }

    // 204 = no content (e.g. suggestion endpoint when nothing to suggest)
    if (res.status === 204) return null;

    return await res.json() as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't log abort errors (timeout) as full errors
    if (msg.includes('abort')) {
      console.warn(`[SalesAgentClient] ${path} timed out after ${TIMEOUT_MS}ms`);
    } else {
      console.error(`[SalesAgentClient] ${path} failed:`, msg);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Chat Reply ─────────────────────────────────────────────

export interface AgentReplyResult {
  text: string;
  shouldEscalate: boolean;
  actions?: Array<{ type: string; label_he: string; label_en: string; url: string }>;
  leadData?: Record<string, string>;
  aiMetadata?: {
    chunksUsed: Array<{ id: string; title: string; similarity: number }>;
    bestSimilarity: number;
    tokensUsed?: { prompt: number; completion: number };
    escalationReason?: string;
  };
}

export async function requestAiReply(params: {
  sessionId: string;
  userMessage: string;
  recentMessages: Array<{ sender: string; text: string }>;
  language?: string;
  context?: { visitorId?: string; page?: string };
}): Promise<AgentReplyResult | null> {
  return agentFetch<AgentReplyResult>('/api/agent/sales/chat/reply', params);
}

// ─── AI Suggestion (HUMAN mode) ────────────────────────────

export interface AgentSuggestionResult {
  text: string;
  leadData?: Record<string, string>;
}

export async function requestAiSuggestion(params: {
  sessionId: string;
  customerMessage: string;
  recentMessages: Array<{ sender: string; text: string }>;
}): Promise<AgentSuggestionResult | null> {
  return agentFetch<AgentSuggestionResult>('/api/agent/sales/chat/suggestion', params);
}

// ─── Lead Extraction ───────────────────────────────────────

export interface AgentLeadExtractionResult {
  leadData: Record<string, string>;
  topic: string;
}

export async function requestLeadExtraction(params: {
  messages: Array<{ sender: string; text: string }>;
}): Promise<AgentLeadExtractionResult | null> {
  return agentFetch<AgentLeadExtractionResult>('/api/agent/sales/lead/extract', params);
}
