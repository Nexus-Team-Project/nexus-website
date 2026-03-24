import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { validate } from '../middleware/validate';
import { authenticate, requireAgent } from '../middleware/authenticate';
import { chatLimiter, apiLimiter } from '../middleware/rateLimiter';
import * as ChatService from '../services/chat.service';
import * as AiService from '../services/ai.service';
import * as NotificationService from '../services/notification.service';
import * as EmailService from '../services/email.service';
import * as OutlookGraph from '../services/outlook-graph.service';
import * as WhatsAppProvider from '../services/whatsapp-provider';
import { env } from '../config/env';
import { getIO } from '../socket';

// ─── Sales Agent hook helper ─────────────────────────────────
function triggerSalesAgentChat(sessionId: string): void {
  if (!env.AGENT_API_URL || !env.AGENT_API_KEY) return;
  fetch(`${env.AGENT_API_URL}/api/agents/sales/skills/lead-qualifier/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Key': env.AGENT_API_KEY,
    },
    body: JSON.stringify({ config: { sessionId, source: 'chat_escalation' } }),
  }).catch(err => console.error('[Sales Agent] Chat escalation trigger failed:', err.message));
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/', 'audio/', 'video/', 'application/pdf', 'application/'];
    if (allowed.some(t => file.mimetype.startsWith(t))) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

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
        mediaUrl: (customerMsg as any).mediaUrl ?? undefined,
        mediaType: (customerMsg as any).mediaType ?? undefined,
        fileName: (customerMsg as any).fileName ?? undefined,
      });

      // 3. Mirror customer message to email thread (all modes)
      const shortId = sessionId.slice(-8);
      let emailMsgId = (session as any).emailMessageId as string | undefined;
      let outlookConvId = (session as any).outlookConversationId as string | undefined;
      let outlookLastMsgId = (session as any).outlookLastMessageId as string | undefined;
      let customerEmailDone: Promise<void> = Promise.resolve();

      console.log(`[Chat] Email mirror: AGENT_EMAIL=${env.AGENT_EMAIL ? 'SET' : 'NOT SET'}, emailMsgId=${emailMsgId ?? 'none'}, outlookConvId=${outlookConvId ?? 'none'}, session=${sessionId}`);

      if (env.AGENT_EMAIL) {
        // Send customer message via SendPulse (appears as received email in agent's inbox)
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

          // Search Outlook inbox for the delivered email to get conversationId
          if (!outlookConvId && OutlookGraph.isConfigured()) {
            try {
              const found = await OutlookGraph.findEmailBySubject(shortId, new Date(Date.now() - 60_000));
              if (found) {
                outlookConvId = found.conversationId;
                outlookLastMsgId = found.id;
                const { prisma } = await import('../config/database');
                await prisma.chatSession.update({
                  where: { id: sessionId },
                  data: {
                    outlookConversationId: found.conversationId,
                    outlookLastMessageId: found.id,
                  },
                }).catch(() => {});
                console.log(`[Chat] Outlook thread anchor: convId=${found.conversationId}, msgId=${found.id}`);
              }
            } catch (err: any) {
              console.error('[Chat] Outlook search FAILED:', err?.message ?? err);
            }
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

              // Try Graph API first — sends FROM agent's mailbox (appears as sent message)
              if (OutlookGraph.isConfigured() && outlookConvId) {
                try {
                  // Find latest message in the conversation to reply to
                  const latest = outlookLastMsgId
                    ? { id: outlookLastMsgId }
                    : await OutlookGraph.findLatestInConversation(outlookConvId);

                  if (latest) {
                    const aiHtml = EmailService.buildAiReplyHtml(aiReply.text, shortId);
                    const draftId = await OutlookGraph.sendReplyFromMailbox(latest.id, aiHtml);
                    console.log(`[Chat] AI reply sent via Graph API (FROM agent mailbox), draftId=${draftId}`);

                    // Update last message ID for next reply chain
                    if (draftId) {
                      outlookLastMsgId = draftId;
                      const { prisma } = await import('../config/database');
                      await prisma.chatSession.update({
                        where: { id: sessionId },
                        data: { outlookLastMessageId: draftId },
                      }).catch(() => {});
                    }
                  } else {
                    // No message to reply to — fall back to SendPulse
                    console.warn('[Chat] No Outlook message found for reply, falling back to SendPulse');
                    await EmailService.sendChatMessageEmail({
                      to: env.AGENT_EMAIL,
                      sessionId,
                      text: aiReply.text,
                      sender: 'AI',
                      emailMessageId: emailMsgId,
                    });
                  }
                } catch (err: any) {
                  console.error('[Chat] Graph API AI reply FAILED, falling back to SendPulse:', err?.message ?? err);
                  await EmailService.sendChatMessageEmail({
                    to: env.AGENT_EMAIL,
                    sessionId,
                    text: aiReply.text,
                    sender: 'AI',
                    emailMessageId: emailMsgId,
                  }).catch((e) => console.error('[Chat] SendPulse fallback also FAILED:', e?.message ?? e));
                }
              } else {
                // Graph API not configured — use SendPulse (separate email, no threading)
                console.log(`[Chat] AI email via SendPulse (Graph not configured or no conversationId)`);
                EmailService.sendChatMessageEmail({
                  to: env.AGENT_EMAIL,
                  sessionId,
                  text: aiReply.text,
                  sender: 'AI',
                  emailMessageId: emailMsgId,
                }).catch((err) => console.error('[Chat] AI email FAILED:', err?.message ?? err));
              }
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
              triggerSalesAgentChat(sessionId);
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

      // Trigger Sales Agent to handle the escalated chat (fire-and-forget)
      triggerSalesAgentChat(req.params.id);

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

// ─── POST /api/chat/sessions/:id/agent-reply ────────────────

const agentReplySchema = z.object({
  body: z.object({
    text: z.string().min(1).max(2000),
  }),
  params: z.object({ id: z.string().min(1) }),
});

router.post(
  '/sessions/:id/agent-reply',
  authenticate,
  requireAgent,
  validate(agentReplySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.id;
      const { text } = req.body;

      const session = await ChatService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Auto-take session if not already in HUMAN mode
      if (session.mode !== 'HUMAN') {
        const { prisma } = await import('../config/database');
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: {
            mode: 'HUMAN',
            status: 'OPEN',
            assignedAgentName: req.user?.email ?? 'Agent',
            modeLockUntil: new Date(Date.now() + 5000),
          },
        });

        const io = getIO();
        io.to(`session:${sessionId}`).emit('mode_changed', { mode: 'HUMAN' });

        await ChatService.saveMessage({
          sessionId,
          text: 'נציג הצטרף לשיחה.',
          sender: 'SYSTEM',
          channel: 'WEB',
        });
      }

      // Determine if this is a WhatsApp session
      const isWaSession = !!(session as any).waThreadId;

      // Save agent message
      const agentMsg = await ChatService.saveMessage({
        sessionId,
        text,
        sender: 'AGENT',
        channel: isWaSession ? 'WHATSAPP' : 'WEB',
      });

      // Forward to customer via Socket.io
      const io = getIO();
      io.to(`session:${sessionId}`).emit('new_message', {
        id: agentMsg.id,
        text: agentMsg.text,
        sender: agentMsg.sender,
        channel: agentMsg.channel,
        timestamp: agentMsg.createdAt,
        mediaUrl: (agentMsg as any).mediaUrl ?? undefined,
        mediaType: (agentMsg as any).mediaType ?? undefined,
        fileName: (agentMsg as any).fileName ?? undefined,
      });

      // If WhatsApp session — also send message to customer on WhatsApp
      if (isWaSession) {
        const waContact = (session as any).waThreadId as string;
        WhatsAppProvider.sendText(waContact, text).catch((err: Error) =>
          console.error(`[Chat] Failed to send WhatsApp reply to ${waContact}:`, err.message),
        );
      }

      res.status(201).json(agentMsg);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/chat/sessions/:id/ai-draft ───────────────────

router.post(
  '/sessions/:id/ai-draft',
  authenticate,
  requireAgent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.id;
      const session = await ChatService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const sessionMeta = (session as any).metadata ?? {};
      const sessionLang = sessionMeta.language?.startsWith?.('en') ? 'en' : 'he';

      const customerMessages = session.messages.filter(m => m.sender === 'CUSTOMER');
      const lastCustomerMsg = customerMessages[customerMessages.length - 1]?.text ?? '';

      const recentMessages = session.messages.map(m => ({
        sender: m.sender,
        text: m.text,
      }));

      const aiReply = await AiService.generateReply(
        sessionId,
        lastCustomerMsg,
        recentMessages,
        sessionLang,
        { visitorId: session.visitorId, page: sessionMeta.page },
      );

      res.json({ text: aiReply?.text ?? '' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/chat/sessions/:id/take ───────────────────────

router.post(
  '/sessions/:id/take',
  authenticate,
  requireAgent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prisma } = await import('../config/database');
      const session = await prisma.chatSession.update({
        where: { id: req.params.id },
        data: {
          mode: 'HUMAN',
          status: 'OPEN',
          assignedAgentName: req.user?.email ?? 'Agent',
          modeLockUntil: new Date(Date.now() + 5000),
        },
      });

      const io = getIO();
      io.to(`session:${req.params.id}`).emit('mode_changed', { mode: 'HUMAN' });

      await ChatService.saveMessage({
        sessionId: req.params.id,
        text: 'נציג הצטרף לשיחה.',
        sender: 'SYSTEM',
        channel: 'WEB',
      });

      res.json(session);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/chat/sessions/:id/release ────────────────────

router.post(
  '/sessions/:id/release',
  authenticate,
  requireAgent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prisma } = await import('../config/database');
      const session = await prisma.chatSession.update({
        where: { id: req.params.id },
        data: {
          mode: 'AI',
          assignedAgentName: null,
          modeLockUntil: new Date(Date.now() + 5000),
        },
      });

      const io = getIO();
      io.to(`session:${req.params.id}`).emit('mode_changed', { mode: 'AI' });

      await ChatService.saveMessage({
        sessionId: req.params.id,
        text: 'הצ\'אט הועבר חזרה ל-AI.',
        sender: 'SYSTEM',
        channel: 'WEB',
      });

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

// ─── POST /api/chat/sessions/:id/agent-reply-media ──────────

router.post(
  '/sessions/:id/agent-reply-media',
  authenticate,
  requireAgent,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.id;
      const file = req.file;
      const caption = (req.body?.caption as string) || '';

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const session = await ChatService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Auto-take session if not already in HUMAN mode
      if (session.mode !== 'HUMAN') {
        const { prisma } = await import('../config/database');
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: {
            mode: 'HUMAN',
            status: 'OPEN',
            assignedAgentName: req.user?.email ?? 'Agent',
            modeLockUntil: new Date(Date.now() + 5000),
          },
        });
        const io = getIO();
        io.to(`session:${sessionId}`).emit('mode_changed', { mode: 'HUMAN' });
      }

      // Determine media type from mimetype
      let mediaType = 'document';
      if (file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';
      else if (file.mimetype.startsWith('video/')) mediaType = 'video';

      // Store as base64 data URL (no external storage needed)
      const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      const agentMsg = await ChatService.saveMessage({
        sessionId,
        text: caption || `[${mediaType}: ${file.originalname}]`,
        sender: 'AGENT',
        channel: 'WEB',
        mediaUrl: dataUrl,
        mediaType,
        fileName: file.originalname,
      });

      const io = getIO();
      io.to(`session:${sessionId}`).emit('new_message', {
        id: agentMsg.id,
        text: agentMsg.text,
        sender: agentMsg.sender,
        channel: agentMsg.channel,
        timestamp: agentMsg.createdAt,
        mediaUrl: dataUrl,
        mediaType,
        fileName: file.originalname,
      });

      res.status(201).json(agentMsg);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/chat/media/:messageId ─────────────────────────

router.get(
  '/media/:messageId',
  authenticate,
  requireAgent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prisma } = await import('../config/database');
      const message = await prisma.chatMessage.findUnique({
        where: { id: req.params.messageId },
        select: { mediaUrl: true, mediaType: true, fileName: true },
      });

      if (!message?.mediaUrl) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      // If it's a data URL, decode and serve directly
      if (message.mediaUrl.startsWith('data:')) {
        const match = message.mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const contentType = match[1];
          const buffer = Buffer.from(match[2], 'base64');
          res.setHeader('Content-Type', contentType);
          if (message.fileName) {
            res.setHeader('Content-Disposition', `inline; filename="${message.fileName}"`);
          }
          res.send(buffer);
          return;
        }
      }

      // Fetch from external URL and pipe through
      const response = await fetch(message.mediaUrl);
      if (!response.ok) {
        res.status(502).json({ error: 'Failed to fetch media' });
        return;
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      if (message.fileName) {
        res.setHeader('Content-Disposition', `inline; filename="${message.fileName}"`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
