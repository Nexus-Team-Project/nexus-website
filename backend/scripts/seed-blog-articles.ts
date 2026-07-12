/**
 * seed-blog-articles.ts
 *
 * Bulk-seeds the blogArticle table from the website's static article data
 * (src/data/blog/articles-{he,en}.ts) so the blog list pages (/he/blog, /blog)
 * are served from the DB via GET /api/blog.
 *
 * Unlike publish-blog-article.ts (single article, DRAFT + admin-approve flow
 * for agent publishing), this script is an operator tool: it upserts every
 * article of the given language directly as PUBLISHED. Re-running is
 * idempotent: content is synced, an existing row's status is never demoted,
 * and publishedAt is only stamped when the row first becomes PUBLISHED.
 *
 * Usage (DATABASE_URL from backend/.env unless overridden):
 *   npx tsx scripts/seed-blog-articles.ts [lang]   # lang: he (default) | en | all
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Maps a static Article object to the BlogArticle column set (without status fields). */
function toRow(article: any, lang: string) {
  return {
    slug: article.slug,
    lang,
    title: article.title,
    subtitle: article.subtitle ?? null,
    excerpt: article.excerpt ?? null,
    heroImage: article.heroImage || null,
    metaTitle: article.metaTitle ?? null,
    metaDescription: article.metaDescription ?? null,
    category: article.category ?? null,
    authorName: article.author?.name ?? null,
    authorRole: article.author?.role ?? null,
    authorAvatar: article.author?.avatar ?? null,
    publishDate: article.publishDate ? new Date(article.publishDate) : null,
    readTime: article.readTime ?? null,
    sectionsJson: article.sections ?? [],
    faqJson: article.faq ?? null,
  };
}

async function seedLang(lang: 'he' | 'en', articles: any[]) {
  console.log(`\nSeeding ${articles.length} "${lang}" articles...`);
  for (const article of articles) {
    const data = toRow(article, lang);
    const existing = await prisma.blogArticle.findUnique({
      where: { slug_lang: { slug: article.slug, lang } },
      select: { status: true, publishedAt: true },
    });

    if (!existing) {
      const row = await prisma.blogArticle.create({
        data: { ...data, status: 'PUBLISHED', publishedAt: data.publishDate ?? new Date() },
      });
      console.log(`  created  PUBLISHED  ${row.slug}`);
      continue;
    }

    // Sync content; promote to PUBLISHED but never demote, and keep an existing publishedAt.
    const row = await prisma.blogArticle.update({
      where: { slug_lang: { slug: article.slug, lang } },
      data: {
        ...data,
        status: 'PUBLISHED',
        publishedAt: existing.publishedAt ?? data.publishDate ?? new Date(),
      },
    });
    console.log(`  updated  ${existing.status} -> PUBLISHED  ${row.slug}`);
  }
}

async function main() {
  const lang = (process.argv[2] || 'he').toLowerCase();
  if (!['he', 'en', 'all'].includes(lang)) {
    console.error('Usage: npx tsx scripts/seed-blog-articles.ts [he|en|all]');
    process.exit(1);
  }

  // Dynamic import to avoid rootDir restrictions (same pattern as publish-blog-article.ts)
  // @ts-ignore
  const { articlesHe } = await import('../../src/data/blog/articles-he');
  // @ts-ignore
  const { articlesEn } = await import('../../src/data/blog/articles-en');

  if (lang === 'he' || lang === 'all') await seedLang('he', articlesHe);
  if (lang === 'en' || lang === 'all') await seedLang('en', articlesEn);

  const published = await prisma.blogArticle.count({ where: { status: 'PUBLISHED' } });
  console.log(`\nDone. PUBLISHED rows in DB: ${published}`);
}

main()
  .catch((e) => {
    console.error('seed-blog-articles failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
