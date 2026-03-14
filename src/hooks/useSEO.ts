// ─── Page-meta override cache ─────────────────────────────────────────────────
// Fetched once per browser session from /api/seo/pages.
// The agent (Tier 1) writes overrides to the DB; this cache picks them up on
// next page load so changes are live within ~1 hour (Cache-Control max-age).

type PageMetaMap = Record<
  string,
  { metaTitle?: string | null; metaDescription?: string | null; ogImage?: string | null }
>;

let _metaCache: PageMetaMap | null = null;
let _fetchPromise: Promise<void> | null = null;

function ensurePageMetaLoaded(): Promise<void> {
  if (_metaCache !== null) return Promise.resolve();
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch('/api/seo/pages')
    .then((r) => (r.ok ? r.json() : {}))
    .then((data: PageMetaMap) => {
      _metaCache = data ?? {};
    })
    .catch(() => {
      _metaCache = {}; // fail silently — use hardcoded defaults
    });

  return _fetchPromise;
}

// ─── Helper: apply meta tags to DOM ──────────────────────────────────────────

function applyMetaTags(
  title: string,
  description: string,
  canonical?: string,
  alternates?: { en?: string; he?: string },
) {
  // Title
  document.title = title;

  // Meta description
  let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    document.head.appendChild(metaDesc);
  }
  metaDesc.content = description;

  // Open Graph
  const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
  if (ogTitle) ogTitle.content = title;

  const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
  if (ogDesc) ogDesc.content = description;

  if (canonical) {
    const ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
    if (ogUrl) ogUrl.content = canonical;
  }

  // Canonical
  if (canonical) {
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonical;
  }

  // hreflang
  document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());
  if (alternates) {
    const { en, he } = alternates;
    const xDefault = en ?? he;
    const addHreflang = (hreflang: string, href: string) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.setAttribute('hreflang', hreflang);
      link.href = href;
      link.setAttribute('data-hreflang', hreflang);
      document.head.appendChild(link);
    };
    if (en) addHreflang('en', en);
    if (he) addHreflang('he', he);
    if (xDefault) addHreflang('x-default', xDefault);
  }
}

// ─── SEOProps ─────────────────────────────────────────────────────────────────

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  /** hreflang alternate URLs. Provide both to declare bilingual equivalents. */
  alternates?: {
    en?: string;
    he?: string;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';

/**
 * Sets document title, meta description, canonical URL, OG tags,
 * and hreflang alternate links for bilingual pages.
 *
 * Also checks /api/seo/pages for agent-written overrides and applies them
 * on top of the component's hardcoded defaults — no deploy needed.
 */
export function useSEO({ title, description, canonical, alternates }: SEOProps) {
  useEffect(() => {
    // 1. Apply component defaults immediately (synchronous, no flash)
    applyMetaTags(title, description, canonical, alternates);

    // 2. Load agent overrides and re-apply if present for this page
    const slug = window.location.pathname;

    ensurePageMetaLoaded().then(() => {
      const override = _metaCache?.[slug];
      if (override?.metaTitle || override?.metaDescription) {
        const overriddenTitle = override.metaTitle ?? title;
        const overriddenDesc  = override.metaDescription ?? description;
        applyMetaTags(overriddenTitle, overriddenDesc, canonical, alternates);
      }
    });

    // Cleanup: remove hreflang links on unmount / route change
    return () => {
      document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());
    };
  }, [title, description, canonical, alternates?.en, alternates?.he]);
}

// Re-export so callers don't need a separate import
export type { SEOProps };
