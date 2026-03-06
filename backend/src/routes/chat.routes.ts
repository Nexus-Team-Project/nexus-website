import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireAgent } from '../middleware/authenticate';
import { chatLimiter, apiLimiter } from '../middleware/rateLimiter';
import * as ChatService from '../services/chat.service';
import * as AiService from '../services/ai.service';
import * as NotificationService from '../services/notification.service';
import { getIO } from '../socket';

const router = Router();

// ─── POST /api/chat/sessions ───────────────────────────────

const createSessionSchema = z.object({
  body: z.object({
    visitorId: z.string().min(1),
    userId: z.string().optional(),
    page: z.string().optional(),
    language: z.string().optional(),
  }),
});

router.post(
  '/sessions',
  apiLimiter,
  validate(createSessionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await ChatService.createSession({
        ...req.body,
        userAgent: req.headers['user-agent'],
      });

      // Notify agent
      NotificationService.handleChatOpened({
        sessionId: session.id,
        visitorId: session.visitorId,
        page: req.body.page,
      }).catch(console.error);

      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/chat/sessions/:id/messages ──────────────────

router.get(
  '/sessions/:id/messages',
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const messages = await ChatService.getMessages(req.params.id);
      res.json(messages);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/chat/sessions/:id/messages ─────────────────

const sendMessageSchema = z.object({
  body: z.object({
    text: z.string().min(1).max(2000),
    visitorId: z.string().min(1),
  }),
  params: z.object({ id: z.string().min(1) }),
});

router.post(
  '/sessions/:id/messages',
  chatLimiter,
  validate(sendMessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.id;
      const { text, visitorId } = req.body;

      const session = await ChatService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // 1. Save customer message
      const customerMsg = await ChatService.saveMessage({
        sessionId,
        text,
        sender: 'CUSTOMER',
        channel: 'WEB',
      });

      // 2. Emit to Socket room so agent sees it immediately
      const io = getIO();
      io.to(`session:${sessionId}`).emit('new_message', {
        id: customerMsg.id,
        text: customerMsg.text,
        sender: customerMsg.sender,
        channel: customerMsg.channel,
        timestamp: customerMsg.createdAt,
      });

      // 3. If in AI mode → generate AI reply (async, returns 200 right away)
      if (session.mode === 'AI') {
        // Return customer message confirmation first
        res.status(201).json(customerMsg);

        // Generate AI reply in background
        AiService.generateReply(sessionId, text, session.messages)
          .then(async (aiReply) => {
            if (!aiReply) return;
            const aiMsg = await ChatService.saveMessage({
              sessionId,
              text: aiReply.text,
              sender: 'AI',
              channel: 'WEB',
            });

            io.to(`session:${sessionId}`).emit('new_message', {
              id: aiMsg.id,
              text: aiMsg.text,
              sender: aiMsg.sender,
              channel: aiMsg.channel,
              timestamp: aiMsg.createdAt,
            });

            // Auto-escalate if AI signals it
            if (aiReply.shouldEscalate) {
              await ChatService.escalateSession(sessionId);
              io.to(`session:${sessionId}`).emit('mode_changed', { mode: 'HUMAN' });
              NotificationService.handleChatEscalated({ sessionId }).catch(console.error);
            }
          })
          .catch(console.error);
      } else {
        // HUMAN mode — just save and return (agent replies via WhatsApp → webhook)
        res.status(201).json(customerMsg);
      }
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/chat/sessions/:id/escalate ─────────────────

router.post(
  '/sessions/:id/escalate',
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await ChatService.escalateSession(req.params.id);
      const io = getIO();
      io.to(`session:${req.params.id}`).emit('mode_changed', { mode: 'HUMAN' });
      NotificationService.handleChatEscalated({ sessionId: req.params.id }).catch(console.error);
      res.json(session);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /api/chat/sessions/:id/close ───────────────────

router.patch(
  '/sessions/:id/close',
  authenticate,
  requireAgent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await ChatService.closeSession(req.params.id);
      const io = getIO();
      io.to(`session:${req.params.id}`).emit('session_closed', {});
      res.json(session);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/chat/sessions (admin/agent) ─────────────────

router.get(
  '/sessions',
  authenticate,
  requireAgent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await ChatService.getAllSessions({
        status: req.query.status as string | undefined,
        mode: req.query.mode as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
      });
      res.json(sessions);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/chat/messages/:id/rate ─────────────────────

const rateSchema = z.object({
  body: z.object({
    rating: z.number().int().min(1).max(5),
    feedback: z.string().max(500).optional(),
    correction: z.string().max(1000).optional(),
  }),
  params: z.object({ id: z.string().min(1) }),
});

router.post(
  '/messages/:id/rate',
  chatLimiter,
  validate(rateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rating = await (await import('../config/database')).prisma.aiRating.upsert({
        where: { messageId: req.params.id },
        create: {
          messageId: req.params.id,
          rating: req.body.rating,
          feedback: req.body.feedback,
          correction: req.body.correction,
          ratedBy: req.user?.sub,
        },
        update: {
          rating: req.body.rating,
          feedback: req.body.feedback,
          correction: req.body.correction,
          ratedBy: req.user?.sub,
        },
      });
      res.json(rating);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
