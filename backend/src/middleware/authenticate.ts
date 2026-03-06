import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwt';

// Extend Express Request with user info
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/** Require valid Bearer access token */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

/** Silently attach user if a valid Bearer token is present — never 401 */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // Invalid/expired token — treat as unauthenticated (guest)
    }
  }
  next();
}

/** Require ADMIN role */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/** Require AGENT or ADMIN role */
export function requireAgent(req: Request, res: Response, next: NextFunction): void {
  if (!['ADMIN', 'AGENT'].includes(req.user?.role ?? '')) {
    res.status(403).json({ error: 'Agent access required' });
    return;
  }
  next();
}
