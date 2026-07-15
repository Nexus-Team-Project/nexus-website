/**
 * publish-blog-article.ts
 *
 * Stages a blog article for publication using the existing agent-approval flow:
 *   1. Upserts the article from src/data/blog/articles-{he,en}.ts into the DB as DRAFT.
 *   2. Files a PENDING AgentRequest(action=BLOG_PUBLISH, payload.articleId).
 *
 * An admin then approves the request (POST /api/admin/agent-requests/:id/approve),
 * which flips the article to PUBLISHED. This script never publishes directly —
 * it respects the DRAFT -> approve gate.
 *
 * Usage:
 *   DATABASE_URL=<target-db> npx tsx scripts/publish-blog-article.ts <slug> [lang]
 *
 * Example (production):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/publish-blog-article.ts welfare-budget-evaporation he
 *
 * Idempotent: re-running syncs content into the existing DRAFT and reuses an
 * existing PENDING request instead of creating a duplicate.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import type { Article } from '../../src/data/blog/types';

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2];
  const lang = process.argv[3] || 'he';

  if (!slug) {
    console.error('Usage: npx tsx scripts/publish-blog-article.ts <slug> [lang]');
    process.exit(1);
  }

  // Dynamic import to avoid rootDir restrictions (same pattern as prisma/seed.ts)
  const { articlesHe } = await import('../../src/data/blog/articles-he');
  const { articlesEn } = await import('../../src/data/blog/articles-en');

  const source: Article[] = lang === 'he' ? articlesHe : articlesEn;
  const article = source.find((a) => a.slug === slug);

  if (!article) {
    console.error(`❌ Article "${slug}" (lang=${lang}) not found in src/data/blog/articles-${lang}.ts`);
    process.exit(1);
  }

  const data = {
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
    // ArticleFAQ is an interface (no index signature), so cast for Prisma's Json input.
    faqJson: (article.faq ?? []) as unknown as Prisma.InputJsonValue,
  };

  // 1. Upsert as DRAFT (status only set on create; never demote an existing article).
  const row = await prisma.blogArticle.upsert({
    where: { slug_lang: { slug, lang } },
    create: { ...data, status: 'DRAFT' },
    update: data,
  });
  console.log(`✅ Article upserted: id=${row.id} status=${row.status} (${slug}/${lang})`);

  if (row.status === 'PUBLISHED') {
    console.log('ℹ️  Article is already PUBLISHED. Content was synced; no publish request needed.');
    return;
  }

  // 2. File a PENDING BLOG_PUBLISH request (reuse an existing one if present).
  const existing = await prisma.agentRequest.findFirst({
    where: { action: 'BLOG_PUBLISH', status: 'PENDING' },
  });
  const alreadyQueued =
    existing && (existing.payload as { articleId?: string } | null)?.articleId === row.id;

  if (alreadyQueued) {
    console.log(`ℹ️  A PENDING BLOG_PUBLISH request already exists: id=${existing!.id}`);
  } else {
    const request = await prisma.agentRequest.create({
      data: {
        action: 'BLOG_PUBLISH',
        status: 'PENDING',
        payload: { articleId: row.id, slug, lang },
        confidence: 1,
        pageUrl: `/${lang}/blog/${slug}`,
      },
    });
    console.log(`✅ Publish request filed: id=${request.id} (action=BLOG_PUBLISH, PENDING)`);
  }

  console.log('');
  console.log('Next step — approve as admin to publish:');
  console.log(`  POST /api/admin/agent-requests/<requestId>/approve`);
  console.log(`  (or approve it from the admin agent-requests screen)`);
}

main()
  .catch((e) => {
    console.error('publish-blog-article failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
