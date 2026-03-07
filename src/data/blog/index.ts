import { articlesHe } from './articles-he';
import { articlesEn } from './articles-en';
import type { Article, ArticleCategory } from './types';

export type { Article, ArticleCategory } from './types';
export type { ArticleSection, ArticleFAQ, ArticleAuthor } from './types';

const articlesByLang: Record<string, Article[]> = {
  he: articlesHe,
  en: articlesEn,
};

/** Return all articles for the given language. */
export function getArticles(lang: string): Article[] {
  return articlesByLang[lang] ?? articlesEn;
}

/** Return articles filtered by category. Pass `undefined` or `'all'` to skip filtering. */
export function getArticlesByCategory(
  lang: string,
  category?: ArticleCategory | 'all',
): Article[] {
  const all = getArticles(lang);
  if (!category || category === 'all') return all;
  return all.filter((a) => a.category === category);
}

/** Look up a single article by slug. Returns `undefined` if not found. */
export function getArticleBySlug(
  slug: string,
  lang: string,
): Article | undefined {
  return getArticles(lang).find((a) => a.slug === slug);
}
