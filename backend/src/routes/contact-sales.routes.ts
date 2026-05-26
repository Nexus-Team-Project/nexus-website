/**
 * Public contact-sales endpoint.
 *
 * Exposes a single POST /api/v1/contact-sales handler that accepts an
 * unauthenticated form submission, validates and sanitises the payload,
 * and triggers the two-email dispatch defined in contact-sales.service.ts.
 *
 * Layered defences:
 *   - express-rate-limit (5 / hour per IP) so abuse is contained.
 *   - Zod schema with strict bounds and an .email() check.
 *   - Field-level sanitisation that strips control bytes, newlines (for
 *     single-line fields), and caps lengths.
 *
 * The handler never echoes provider error details to the caller; failures
 * surface as a generic 500 while the underlying message is logged.
 */

import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { contactSalesLimiter } from '../middleware/rateLimiter';
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_MIN_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  sanitizeEmail,
  sanitizeMessage,
  sanitizePhone,
  sanitizeShortText,
} from '../utils/contact-sanitize.util';
import { dispatchContactSales } from '../services/contact-sales.service';

const router = Router();

// ─── Schema ──────────────────────────────────────────────────────────────────

const contactSalesSchema = z.object({
  body: z.object({
    // Email is required so we can send the confirmation back.
    email: z.string().trim().min(3).max(254).email(),

    // Phone is optional. Validation is permissive; the precise format is
    // enforced client-side by react-phone-number-input (E.164).
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^\+?[0-9\s().-]*$/u, 'invalid phone')
      .optional()
      .or(z.literal('')),

    name: z.string().trim().max(CONTACT_NAME_MAX_LENGTH).optional().or(z.literal('')),

    message: z
      .string()
      .trim()
      .min(CONTACT_MESSAGE_MIN_LENGTH, `Message must be at least ${CONTACT_MESSAGE_MIN_LENGTH} characters`)
      .max(CONTACT_MESSAGE_MAX_LENGTH, `Message must be at most ${CONTACT_MESSAGE_MAX_LENGTH} characters`),

    language: z.enum(['en', 'he']).default('en'),

    page: z.string().trim().max(2048).optional().or(z.literal('')),
  }),
});

// ─── Route ───────────────────────────────────────────────────────────────────

router.post(
  '/',
  contactSalesLimiter,
  validate(contactSalesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as z.infer<typeof contactSalesSchema>['body'];

      // Re-sanitise after validation so the values that reach the email
      // template are guaranteed clean even if Zod is loosened later.
      const email = sanitizeEmail(body.email);
      const phone = body.phone ? sanitizePhone(body.phone) : undefined;
      const name = body.name ? sanitizeShortText(body.name, CONTACT_NAME_MAX_LENGTH) : undefined;
      const message = sanitizeMessage(body.message);

      if (message.length < CONTACT_MESSAGE_MIN_LENGTH) {
        res.status(422).json({ error: 'Validation failed', issues: { message: ['Message is too short after sanitisation'] } });
        return;
      }

      const language: 'en' | 'he' = body.language === 'he' ? 'he' : 'en';
      const page = body.page ? sanitizeShortText(body.page, 2048) : undefined;

      const forwardedFor = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
      const ipAddress = sanitizeShortText(forwardedFor ?? req.ip ?? '', 64) || undefined;
      const userAgentRaw = req.headers['user-agent'];
      const userAgent = typeof userAgentRaw === 'string'
        ? sanitizeShortText(userAgentRaw, 256)
        : undefined;

      await dispatchContactSales({
        email,
        phone: phone || undefined,
        name: name || undefined,
        message,
        language,
        page,
        ipAddress,
        userAgent,
      });

      res.status(202).json({ ok: true });
    } catch (err) {
      // Log internally but never surface provider details to the caller.
      // Swallowing the error here would make the form silently broken.
      console.error('[contact-sales] dispatch failed:', err instanceof Error ? err.message : err);
      next(err);
    }
  },
);

export default router;
