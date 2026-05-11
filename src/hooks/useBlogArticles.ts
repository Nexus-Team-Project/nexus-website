// This hook loads published blog content from the standalone backend API.
import { useEffect, useState } from 'react';
import type { Article, ArticleSection, ArticleFAQ } from '../data/blog/types';
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
    category: raw.category ?? 'benefits',
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
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/blog?lang=${lang}&status=published&limit=100`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data: { articles?: BlogArticleDto[] }) => {
        if (!cancelled) {
          setArticles((data.articles ?? []).map(toArticle));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [lang]);

  return { articles, loading, error };
}

interface UseBlogArticleResult {
  article: Article | null;
  loading: boolean;
  error: string | null;
}

export function useBlogArticle(slug: string | undefined, lang: string): UseBlogArticleResult {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/blog/${slug}?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status === 404 ? 'not_found' : r.statusText)))
      .then((data: { article: BlogArticleDto }) => {
        if (!cancelled) {
          setArticle(toArticle(data.article));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [slug, lang]);

  return { article, loading, error };
}
