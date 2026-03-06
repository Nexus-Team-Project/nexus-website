import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { EventChannel } from '@prisma/client';
import { validate } from '../middleware/validate';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import * as AnalyticsService from '../services/analytics.service';
import * as NotificationService from '../services/notification.service';

const router = Router();

// ─── POST /api/analytics/track  (unified event ingestion) ─

const trackSchema = z.object({
  body: z.object({
    anonymousId: z.string().min(1),
    userId: z.string().optional(),
    eventName: z.string().min(1),
    channel: z.nativeEnum(EventChannel),
    properties: z.record(z.unknown()).default({}),
    context: z.record(z.unknown()).default({}),
    sentAt: z.string().optional(),
    mergeSource: z.enum(['signup', 'login', 'oauth']).optional(),
  }),
});

router.post(
  '/track',
  apiLimiter,
  validate(trackSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip;
      const ua = req.headers['user-agent'] ?? '';

      // Enrich context with server-side data
      const enrichedContext = {
        ...req.body.context,
        ip,
        userAgent: ua,
      };

      await AnalyticsService.ingest({ ...req.body, context: enrichedContext });

      // Fire visitor notification for page views (fire-and-forget)
      if (req.body.eventName === 'Page_Viewed') {
        NotificationService.handleVisitorArrival({
          visitorId: req.body.anonymousId,
          page: String(req.body.properties?.page_path ?? '/'),
          country: String((enrichedContext as any).device?.country ?? ''),
        }).catch(console.error);
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/analytics/pageview ─────────────────────────

const pageviewSchema = z.object({
  body: z.object({
    visitorId: z.string().min(1),
    userId: z.string().optional(),
    page: z.string().min(1),
    referrer: z.string().optional(),
    language: z.string().optional(),
  }),
});

router.post(
  '/pageview',
  apiLimiter,
  validate(pageviewSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      await AnalyticsService.trackPageView({
        ...req.body,
        userAgent,
        ipAddress,
      });

      // Fire visitor notification if new/returning today (fire-and-forget)
      NotificationService.handleVisitorArrival({
        visitorId: req.body.visitorId,
        page: req.body.page,
        country: req.body.country,
      }).catch(console.error);

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/analytics/event ────────────────────────────

const eventSchema = z.object({
  body: z.object({
    visitorId: z.string().min(1),
    userId: z.string().optional(),
    eventType: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  }),
});

router.post(
  '/event',
  apiLimiter,
  validate(eventSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AnalyticsService.trackEvent(req.body);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/analytics/summary (admin) ───────────────────

router.get(
  '/summary',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = Number(req.query.days) || 7;
      const summary = await AnalyticsService.getAnalyticsSummary(days);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
