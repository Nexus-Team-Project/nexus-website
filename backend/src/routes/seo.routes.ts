import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

const router = Router();

// ─── GET /api/seo/pages ─────────────────────────────────────────────────────
/**
 * Returns all PageMeta overrides as a flat map keyed by slug.
 * Public, no auth. Used by the frontend useSEO hook to fetch overrides once
 * per session and apply them over hardcoded component defaults.
 *
 * Response shape:
 *   {
 *     "/":            { metaTitle: "...", metaDescription: "...", ogImage: null },
 *     "/he/benefits": { metaTitle: "...", metaDescription: "...", ogImage: null },
 *     ...
 *   }
 *
 * Cached for 1 hour by CDN/browser; stale-while-revalidate for 24 h.
 */
router.get('/pages', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const records = await prisma.pageMeta.findMany({
      select: {
        slug: true,
        metaTitle: true,
        metaDescription: true,
        ogImage: true,
      },
    });

    const map: Record<
      string,
      { metaTitle: string | null; metaDescription: string | null; ogImage: string | null }
    > = {};

    for (const r of records) {
      map[r.slug] = {
        metaTitle: r.metaTitle,
        metaDescription: r.metaDescription,
        ogImage: r.ogImage,
      };
    }

    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(map);
  } catch (err) {
    next(err);
  }
});

export default router;
