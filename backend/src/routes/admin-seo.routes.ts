/**
 * Admin SEO Analytics Proxy Routes
 *
 * Forwards admin SEO requests from nexus-website to the nexus-agents API.
 * Protected with authenticate + requireAdmin middleware.
 *
 * Mounted at /api/admin/seo
 */

import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { env } from '../config/env';

const router = Router();
router.use(authenticate, requireAdmin);

// Generic proxy: forwards any request to nexus-agents /api/agent/* endpoints
router.all('/*', async (req: Request, res: Response) => {
  if (!env.AGENT_API_URL || !env.AGENT_API_KEY) {
    return res.status(503).json({ error: 'Agent service not configured' });
  }

  // Strip /api/admin/seo prefix → forward as /api/agent/*
  // e.g. /api/admin/seo/google/search-console/overview → /api/agent/google/search-console/overview
  const agentPath = req.path; // already relative to mount point
  const queryString = req.originalUrl.includes('?')
    ? '?' + req.originalUrl.split('?')[1]
    : '';
  const targetUrl = `${env.AGENT_API_URL}/api/agent${agentPath}${queryString}`;

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

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error('[AdminSEO] Proxy error:', err);
    res.status(502).json({ error: 'Agent service unavailable' });
  }
});

export default router;
