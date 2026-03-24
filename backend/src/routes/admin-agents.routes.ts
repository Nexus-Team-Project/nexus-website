/**
 * Admin Agent Proxy Routes
 *
 * Forwards admin agent requests from nexus-website to the nexus-agents API.
 * Protected with authenticate + requireAdmin middleware.
 *
 * Mounted at /api/admin/agents
 */

import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { env } from '../config/env';

const router = Router();
router.use(authenticate, requireAdmin);

// Generic proxy: forwards any request to nexus-agents API
router.all('/*', async (req: Request, res: Response) => {
  if (!env.AGENT_API_URL || !env.AGENT_API_KEY) {
    return res.status(503).json({ error: 'Agent service not configured' });
  }

  const targetUrl = `${env.AGENT_API_URL}/api/agents${req.path}`;

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

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Agent service unavailable' });
  }
});

export default router;
