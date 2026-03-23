import rateLimit from 'express-rate-limit';

const json429 = (_req: unknown, res: { status: (n: number) => { json: (b: object) => void } }) =>
  res.status(429).json({ error: 'Too many requests, please slow down.' });

/** Auth routes: 20 requests / 15 min */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

/** Password reset: 3 requests / 60 min */
export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

/** Chat messages: 30 / min per IP */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

/** General API: 100 / min */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});
