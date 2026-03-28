/**
 * Admin Agent Proxy Routes
 *
 * Forwards admin agent requests from nexus-website to the nexus-agents API.
 * Protected with authenticate + requireAdmin middleware.
 *
 * Mounted at /api/admin/agents
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { env } from '../config/env';

const router = Router();
router.use(authenticate, requireAdmin);

// Generic proxy: forwards any request to nexus-agents API
router.all('/*', async (req: Request, res: Response, next: NextFunction) => {
  if (!env.AGENT_API_URL || !env.AGENT_API_KEY) {
    return res.status(503).json({ error: 'Agent service not configured' });
  }

  // Use req.url (not req.path) to preserve query parameters
  const targetUrl = `${env.AGENT_API_URL}/api/agents${req.url}`;

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

    // Handle non-JSON responses gracefully
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[AgentProxy] Non-JSON response from ${targetUrl}:`, response.status, text.slice(0, 200));
      return res.status(502).json({ error: 'Agent service returned non-JSON response' });
    }

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[AgentProxy] Fetch error:', (err as Error).message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Agent service unavailable' });
    }
  }
});

export default router;
