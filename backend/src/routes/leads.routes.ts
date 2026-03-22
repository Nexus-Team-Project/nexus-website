import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import * as NotificationService from '../services/notification.service';
import * as ApolloService from '../services/apollo.service';
import * as MondayService from '../services/monday.service';
import { ingest } from '../services/analytics.service';

const router = Router();

// ─── POST /api/leads ──────────────────────────────────────

const createLeadSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    fullName: z.string().min(2).max(100).optional(),
    company: z.string().max(100).optional(),
    phone: z.string().max(20).optional(),
    message: z.string().max(2000).optional(),
    source: z.string().optional(),
  }),
});

router.post(
  '/',
  apiLimiter,
  validate(createLeadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await prisma.lead.create({ data: req.body });

      // Enrich with Apollo if email provided (fire-and-forget)
      if (req.body.email) {
        ApolloService.enrichByEmail(req.body.email)
          .then(async (apolloData) => {
            if (apolloData?.id) {
              await prisma.lead.update({
                where: { id: lead.id },
                data: { apolloId: apolloData.id },
              });
            }
          })
          .catch(console.error);

        // Create contact in Apollo CRM
        ApolloService.createContact({
          email: req.body.email,
          first_name: req.body.fullName?.split(' ')[0],
          last_name: req.body.fullName?.split(' ').slice(1).join(' '),
          organization_name: req.body.company,
          phone: req.body.phone,
        }).catch(console.error);
      }

      // Notify agent
      NotificationService.handleLeadSubmitted({
        leadId: lead.id,
        ...req.body,
      }).catch(console.error);

      // Create lead on Monday.com CRM (fire-and-forget)
      MondayService.createLead({
        name: req.body.fullName ?? req.body.email ?? 'Unknown',
        email: req.body.email,
        company: req.body.company,
        phone: req.body.phone,
        source: req.body.source ?? 'contact_form',
      }).catch(console.error);

      // Analytics: fire-and-forget
      void ingest({
        anonymousId: (req.headers['x-anonymous-id'] as string | undefined) ?? `anon_lead_${lead.id}`,
        eventName: 'Lead_Form_Submitted',
        channel: 'MARKETING',
        properties: {
          lead_id: lead.id,
          form_name: req.body.source ?? 'contact_sales',
          has_email: !!req.body.email,
          has_company: !!req.body.company,
          source_page: req.headers['referer'] ?? undefined,
        },
        context: { ip: req.ip, userAgent: req.headers['user-agent'] ?? '' },
      }).catch(() => {});

      res.status(201).json({ id: lead.id, message: 'Lead received' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/leads (admin) ───────────────────────────────

router.get(
  '/',
  authenticate,
  requireAdmin,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(100, Number(req.query.limit) || 100);
      const leads = await prisma.lead.findMany({
        where: status ? { status: status as 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'LOST' } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      res.json(leads);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /api/leads/:id (admin) ────────────────────────

router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await prisma.lead.update({
        where: { id: req.params.id },
        data: { status: req.body.status },
      });
      res.json(lead);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
