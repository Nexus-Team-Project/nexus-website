/**
 * Admin SEO Analytics Proxy Routes
 *
 * Forwards admin SEO requests from nexus-website to the nexus-agents API.
 * Protected with authenticate + requireAgent middleware.
 *
 * Mounted at /api/admin/seo
 */

import { Router, Request, Response } from 'express';
import { authenticate, requireAgent } from '../middleware/authenticate';
import { env } from '../config/env';

const router = Router();
router.use(authenticate, requireAgent);

// ─── Diagnostic endpoint (no proxy) ──────────────────────────
router.get('/status', async (_req: Request, res: Response) => {
  const configured = !!(env.AGENT_API_URL && env.AGENT_API_KEY);
  let agentReachable = false;
  let agentHealth: unknown = null;

  if (configured) {
    try {
      const r = await fetch(`${env.AGENT_API_URL}/health`, { signal: AbortSignal.timeout(5000) });
      agentHealth = await r.json().catch(() => r.statusText);
      agentReachable = r.ok;
    } catch (err: any) {
      agentHealth = err.message;
    }
  }

  res.json({
    configured,
    agentUrl: env.AGENT_API_URL
      ? env.AGENT_API_URL.replace(/\/\/(.{4}).*?(@|\.up)/, '//$1***$2')
      : null,
    agentReachable,
    agentHealth,
  });
});

// ─── Generic proxy: forwards to nexus-agents /api/agent/* ────
router.all('/*', async (req: Request, res: Response) => {
  if (!env.AGENT_API_URL || !env.AGENT_API_KEY) {
    console.warn('[AdminSEO] AGENT_API_URL or AGENT_API_KEY not set');
    return res.status(503).json({ error: 'Agent service not configured' });
  }

  // Strip /api/admin/seo prefix → forward as /api/agent/*
  const agentPath = req.path; // already relative to mount point
  const queryString = req.originalUrl.includes('?')
    ? '?' + req.originalUrl.split('?')[1]
    : '';
  const targetUrl = `${env.AGENT_API_URL}/api/agent${agentPath}${queryString}`;

  console.log(`[AdminSEO] Proxy ${req.method} ${agentPath} → ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': env.AGENT_API_KEY,
      },
      ...(req.method !== 'GET' && req.method !== 'HEAD'
        ? { body: JSON.stringify(req.body) }
        : {}),
    });

    console.log(`[AdminSEO] Agent responded ${response.status} for ${agentPath}`);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (err: any) {
    console.error(`[AdminSEO] Proxy error for ${agentPath}:`, err.message ?? err);
    res.status(502).json({ error: 'Agent service unavailable', detail: err.message });
  }
});

export default router;
