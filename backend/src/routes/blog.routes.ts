import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

const router = Router();

// GET /api/blog?lang=en&status=published&page=1&limit=20
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lang = (req.query.lang as string) || 'en';
    const status = ((req.query.status as string) || 'published').toUpperCase();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [articles, total] = await Promise.all([
      prisma.blogArticle.findMany({
        where: { lang, status: status as any },
        orderBy: { publishDate: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          slug: true,
          lang: true,
          status: true,
          title: true,
          subtitle: true,
          excerpt: true,
          heroImage: true,
          metaTitle: true,
          metaDescription: true,
          category: true,
          authorName: true,
          authorRole: true,
          authorAvatar: true,
          publishDate: true,
          readTime: true,
          publishedAt: true,
          updatedAt: true,
          // Exclude sectionsJson / faqJson from list endpoint for performance
        },
      }),
      prisma.blogArticle.count({ where: { lang, status: status as any } }),
    ]);

    res.json({
      articles,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/blog/:slug?lang=en
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const lang = (req.query.lang as string) || 'en';

    const article = await prisma.blogArticle.findUnique({
      where: { slug_lang: { slug, lang } },
    });

    if (!article) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    // Only serve published articles publicly (drafts are agent-only)
    if (article.status !== 'PUBLISHED') {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    res.json({ article });
  } catch (err) {
    next(err);
  }
});

export default router;
