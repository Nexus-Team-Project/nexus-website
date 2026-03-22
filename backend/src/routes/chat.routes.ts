import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireAgent } from '../middleware/authenticate';
import { chatLimiter, apiLimiter } from '../middleware/rateLimiter';
import * as ChatService from '../services/chat.service';
import * as AiService from '../services/ai.service';
import * as NotificationService from '../services/notification.service';
import * as EmailService from '../services/email.service';
import { env } from '../config/env';
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

      let session = await ChatService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Mode lock: if a mode transition is in progress, wait briefly and re-fetch
      if (session.modeLockUntil && new Date(session.modeLockUntil) > new Date()) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        session = (await ChatService.getSession(sessionId))!;
        if (!session) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }
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

      // 3. Mirror customer message to email thread (all modes)
      let emailMsgId = (session as any).emailMessageId as string | undefined;
      let customerEmailDone: Promise<void> = Promise.resolve();

      console.log(`[Chat] Email mirror: AGENT_EMAIL=${env.AGENT_EMAIL ? 'SET' : 'NOT SET'}, emailMsgId=${emailMsgId ?? 'none'}, session=${sessionId}`);
      if (env.AGENT_EMAIL) {
        customerEmailDone = EmailService.sendChatMessageEmail({
          to: env.AGENT_EMAIL,
          sessionId,
          text,
          sender: 'CUSTOMER',
          emailMessageId: emailMsgId,
        }).then(async (sentMsgId) => {
          console.log(`[Chat] Customer email sent OK: msgId=${sentMsgId ?? 'null'}`);
          // Save first email's Message-ID on session for threading
          if (sentMsgId && !emailMsgId) {
            emailMsgId = sentMsgId;
            const { prisma } = await import('../config/database');
            await prisma.chatSession.update({
              where: { id: sessionId },
              data: { emailMessageId: sentMsgId },
            }).catch(() => {});
            console.log(`[Chat] Saved thread anchor: ${sentMsgId}`);
          }
        }).catch((err) => {
          console.error('[Chat] Customer email FAILED:', err?.message ?? err);
        });
      }

      // 4. If in AI mode → generate AI reply (async, returns 200 right away)
      if (session.mode === 'AI') {
        // Return customer message confirmation first
        res.status(201).json(customerMsg);

        // Detect language from session metadata or default to Hebrew
        const sessionMeta = (session as any).metadata ?? {};
        const sessionLang = sessionMeta.language?.startsWith?.('en') ? 'en' : 'he';

        // Generate AI reply in background (with visitor + page context)
        AiService.generateReply(sessionId, text, session.messages, sessionLang, {
          visitorId: session.visitorId,
          page: sessionMeta.page,
        })
          .then(async (aiReply) => {
            if (!aiReply) return;
            const aiMsg = await ChatService.saveMessage({
              sessionId,
              text: aiReply.text,
              sender: 'AI',
              channel: 'WEB',
              aiMetadata: aiReply.aiMetadata,
            });

            io.to(`session:${sessionId}`).emit('new_message', {
              id: aiMsg.id,
              text: aiMsg.text,
              sender: aiMsg.sender,
              channel: aiMsg.channel,
              timestamp: aiMsg.createdAt,
              actions: aiReply.actions,
            });

            // Mirror AI reply to email thread
            if (env.AGENT_EMAIL) {
              // Wait for customer email to finish so thread anchor is saved
              await customerEmailDone;
              console.log(`[Chat] AI email mirror: threadId=${emailMsgId ?? 'none'}, aiText="${aiReply.text.slice(0, 50)}"`);
              EmailService.sendChatMessageEmail({
                to: env.AGENT_EMAIL,
                sessionId,
                text: aiReply.text,
                sender: 'AI',
                emailMessageId: emailMsgId,
              }).catch((err) => console.error('[Chat] AI email FAILED:', err?.message ?? err));
            }

            // Save lead data if AI extracted any
            if (aiReply.leadData && Object.keys(aiReply.leadData).length > 0) {
              ChatService.upsertLeadFromChat(sessionId, aiReply.leadData).catch(console.error);
            }

            // Auto-escalate if AI signals it
            if (aiReply.shouldEscalate) {
              await ChatService.escalateSession(sessionId);
              io.to(`session:${sessionId}`).emit('mode_changed', { mode: 'HUMAN' });
              NotificationService.handleChatEscalated({ sessionId }).catch(console.error);
            }
          })
          .catch(console.error);
      } else {
        // HUMAN mode — email already mirrored above
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

      // Auto-extract lead data + detect topic on escalation (async, non-blocking)
      const fullSession = await ChatService.getSession(req.params.id);
      if (fullSession?.messages) {
        const msgs = fullSession.messages.map((m) => ({ sender: m.sender, text: m.text }));
        const topic = AiService.detectEscalationTopic(msgs);

        // Get last 5 messages for escalation context
        const recentMsgs = msgs.slice(-5).map((m) => ({
          sender: m.sender === 'CUSTOMER' ? 'לקוח' : 'AI',
          text: m.text.slice(0, 200),
        }));
        const page = (fullSession.metadata as Record<string, unknown>)?.page as string | undefined;

        AiService.extractLeadData(msgs).then(async (leadData) => {
          if (Object.keys(leadData).length > 0) {
            await ChatService.upsertLeadFromChat(req.params.id, leadData);
          }
          NotificationService.handleChatEscalated({
            sessionId: req.params.id, topic, leadData, recentMessages: recentMsgs, page,
          }).catch(console.error);
        }).catch(() => {
          NotificationService.handleChatEscalated({
            sessionId: req.params.id, topic, recentMessages: recentMsgs, page,
          }).catch(console.error);
        });
      } else {
        NotificationService.handleChatEscalated({ sessionId: req.params.id }).catch(console.error);
      }
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
      const { prisma: db } = await import('../config/database');
      const rating = await db.aiRating.upsert({
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

      // Auto-generate few-shot example from low-rated corrections (Phase 8B)
      if (req.body.rating <= 2 && req.body.correction) {
        (async () => {
          try {
            // Find the customer message that preceded this AI message
            const aiMessage = await db.chatMessage.findUnique({
              where: { id: req.params.id },
              select: { sessionId: true, createdAt: true },
            });
            if (!aiMessage) return;

            const customerMsg = await db.chatMessage.findFirst({
              where: {
                sessionId: aiMessage.sessionId,
                sender: 'CUSTOMER',
                createdAt: { lt: aiMessage.createdAt },
              },
              orderBy: { createdAt: 'desc' },
            });
            if (!customerMsg) return;

            // Generate embedding for the example
            const embedding = await AiService.embedText(
              `${customerMsg.text}\n${req.body.correction}`,
            );

            // Create auto-generated few-shot example
            await db.aiExample.create({
              data: {
                question: customerMsg.text,
                answer: req.body.correction,
                category: 'auto_correction',
                language: 'he',
                isActive: true,
                embedding,
              },
            });
            console.log('[AI] Auto-created example from correction for message', req.params.id);
          } catch (e) {
            console.error('[AI] Failed to auto-create example from correction:', e);
          }
        })();
      }

      res.json(rating);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
