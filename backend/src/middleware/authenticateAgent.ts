import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Authenticate requests from the SEO Agent (or any future agent).
 *
 * Validates the X-Agent-Key header against SEO_AGENT_API_KEY env var.
 * This is the gateway between the agent service and the Nexus website.
 */
export function authenticateAgent(req: Request, res: Response, next: NextFunction): void {
  // Feature disabled if key not configured
  if (!env.SEO_AGENT_API_KEY) {
    res.status(503).json({ error: 'Agent gateway not configured' });
    return;
  }

  const agentKey = req.headers['x-agent-key'] as string | undefined;

  if (!agentKey) {
    res.status(401).json({ error: 'Missing X-Agent-Key header' });
    return;
  }

  if (agentKey !== env.SEO_AGENT_API_KEY) {
    res.status(401).json({ error: 'Invalid agent key' });
    return;
  }

  next();
}
