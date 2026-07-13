// This hook loads published blog content from the standalone backend API.
import { useEffect, useState } from 'react';
import type { Article, ArticleCategory, ArticleSection, ArticleFAQ } from '../data/blog/types';
import { API_URL } from '../lib/api';

interface BlogArticleDto {
  slug: string;
  title: string;
  subtitle?: string | null;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  category?: string | null;
  heroImage?: string | null;
  authorName?: string | null;
  authorRole?: string | null;
  authorAvatar?: string | null;
  publishDate?: string | null;
  createdAt?: string | null;
  readTime?: number | null;
  sectionsJson?: ArticleSection[] | null;
  faqJson?: ArticleFAQ[] | null;
}

/** Transform a DB-shaped article response into the Article type used by pages. */
function toArticle(raw: BlogArticleDto): Article {
  return {
    slug: raw.slug,
    title: raw.title,
    subtitle: raw.subtitle ?? '',
    excerpt: raw.excerpt ?? '',
    metaTitle: raw.metaTitle ?? raw.title,
    metaDescription: raw.metaDescription ?? raw.excerpt ?? '',
    category: (raw.category as ArticleCategory | null) ?? 'benefits',
    heroImage: raw.heroImage ?? '',
    author: {
      name: raw.authorName ?? 'Nexus Team',
      role: raw.authorRole ?? '',
      ...(raw.authorAvatar ? { avatar: raw.authorAvatar } : {}),
    },
    publishDate: raw.publishDate
      ? new Date(raw.publishDate).toISOString().split('T')[0]
      : raw.createdAt
        ? new Date(raw.createdAt).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    readTime: raw.readTime ?? 5,
    sections: (raw.sectionsJson ?? []) as ArticleSection[],
    faq: (raw.faqJson ?? []) as ArticleFAQ[],
  };
}

interface UseBlogArticlesResult {
  articles: Article[];
  loading: boolean;
  error: string | null;
}

export function useBlogArticles(lang: string): UseBlogArticlesResult {
  // The stored result is keyed by the request (lang) it answered; `loading` is
  // DERIVED by comparing that key to the current lang, so the effect never
  // needs a synchronous setState. Initial load and lang changes both render
  // as loading until the matching response lands (same UX as before).
  const [result, setResult] = useState<{ key: string; articles: Article[]; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/api/blog?lang=${lang}&status=published&limit=100`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data: { articles?: BlogArticleDto[] }) => {
        if (!cancelled) {
          setResult({ key: lang, articles: (data.articles ?? []).map(toArticle), error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ key: lang, articles: [], error: String(err) });
        }
      });

    return () => { cancelled = true; };
  }, [lang]);

  const fresh = result?.key === lang ? result : null;
  return { articles: fresh?.articles ?? [], loading: fresh === null, error: fresh?.error ?? null };
}

interface UseBlogArticleResult {
  article: Article | null;
  loading: boolean;
  error: string | null;
}

export function useBlogArticle(slug: string | undefined, lang: string): UseBlogArticleResult {
  // Same derived-loading pattern as useBlogArticles, keyed by slug + lang.
  const [result, setResult] = useState<{ key: string; article: Article | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!slug) return;
    const key = `${slug}|${lang}`;
    let cancelled = false;

    fetch(`${API_URL}/api/blog/${slug}?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status === 404 ? 'not_found' : r.statusText)))
      .then((data: { article: BlogArticleDto }) => {
        if (!cancelled) {
          setResult({ key, article: toArticle(data.article), error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ key, article: null, error: String(err) });
        }
      });

    return () => { cancelled = true; };
  }, [slug, lang]);

  if (!slug) return { article: null, loading: false, error: null };
  const fresh = result?.key === `${slug}|${lang}` ? result : null;
  return { article: fresh?.article ?? null, loading: fresh === null, error: fresh?.error ?? null };
}
