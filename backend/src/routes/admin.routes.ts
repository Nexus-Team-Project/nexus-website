import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import * as AiService from '../services/ai.service';
import * as EmailService from '../services/email.service';

const router = Router();
router.use(authenticate, requireAdmin, apiLimiter);

// ════════════════════════════════════════════════════════════
// KNOWLEDGE CHUNKS
// ════════════════════════════════════════════════════════════

// GET /api/admin/ai/knowledge
router.get('/knowledge', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Exclude embedding vector from response (too large)
    const chunks = await prisma.knowledgeChunk.findMany({
      select: { id: true, title: true, content: true, source: true, language: true, isActive: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(chunks);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ai/knowledge
const createChunkSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(200),
    content: z.string().min(10),
    source: z.string().optional(),
    language: z.string().default('he'),
  }),
});

router.post('/knowledge', validate(createChunkSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chunk = await AiService.addKnowledgeChunk(req.body);
    res.status(201).json(chunk);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/ai/knowledge/:id
router.put('/knowledge/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AiService.updateKnowledgeChunk(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/ai/knowledge/:id
router.delete('/knowledge/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.knowledgeChunk.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════
// AI CONFIG (system prompt etc.)
// ════════════════════════════════════════════════════════════

// GET /api/admin/ai/config
router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await prisma.aiConfig.findMany({ orderBy: { key: 'asc' } });
    res.json(configs);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/ai/config/:key
router.put('/config/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.aiConfig.upsert({
      where: { key: req.params.key },
      create: {
        key: req.params.key,
        value: req.body.value,
        description: req.body.description,
        updatedBy: req.user?.sub,
      },
      update: {
        value: req.body.value,
        updatedBy: req.user?.sub,
      },
    });
    // Bust the in-memory cache so AI picks up the new prompt immediately
    if (req.params.key === 'system_prompt') {
      AiService.invalidatePromptCache();
    }
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════
// FEW-SHOT EXAMPLES
// ════════════════════════════════════════════════════════════

// GET /api/admin/ai/examples
router.get('/examples', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const examples = await prisma.aiExample.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(examples);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ai/examples
const createExampleSchema = z.object({
  body: z.object({
    question: z.string().min(5),
    answer: z.string().min(5),
    category: z.string().optional(),
    language: z.string().default('he'),
  }),
});

router.post('/examples', validate(createExampleSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ex = await prisma.aiExample.create({ data: req.body });
    res.status(201).json(ex);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/ai/examples/:id
router.delete('/examples/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.aiExample.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════
// RATINGS & QUALITY
// ════════════════════════════════════════════════════════════

// GET /api/admin/ai/ratings
router.get('/ratings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [ratings, avg] = await Promise.all([
      prisma.aiRating.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.aiRating.aggregate({ _avg: { rating: true }, _count: true }),
    ]);
    res.json({ ratings, avgRating: avg._avg.rating, totalCount: avg._count });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/ai/low-rated
router.get('/low-rated', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const lowRated = await prisma.aiRating.findMany({
      where: { rating: { lte: 2 } },
      include: { message: { select: { text: true, createdAt: true, sessionId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(lowRated);
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════
// TEST AI RESPONSE
// ════════════════════════════════════════════════════════════

// POST /api/admin/ai/test
router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question } = req.body as { question: string };
    if (!question) {
      res.status(400).json({ error: 'question required' });
      return;
    }
    const result = await AiService.testAiResponse(question);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════
// TEST EMAIL
// ════════════════════════════════════════════════════════════

// POST /api/admin/ai/test-email  — sends a test verification email and returns result
router.post('/test-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const to = (req.body?.to as string) || req.user!.email;
    const lang = (req.body?.lang as 'en' | 'he') ?? 'he';
    await EmailService.sendVerificationEmail(to, 'Test User', 'TEST_TOKEN_123', lang);
    res.json({ ok: true, sentTo: to });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

export default router;
