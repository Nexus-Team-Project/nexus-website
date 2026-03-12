import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  /** Override the favicon for this page. Pass the public-folder path, e.g. "/nexus-api-favicon.png". */
  favicon?: string;
  /** hreflang alternate URLs. Provide both to declare bilingual equivalents. */
  alternates?: {
    en?: string;
    he?: string;
  };
}

/**
 * Sets document title, meta description, canonical URL, og tags,
 * and hreflang alternate links for bilingual pages.
 */
export function useSEO({ title, description, canonical, favicon, alternates }: SEOProps) {
  useEffect(() => {
    // ── Title ──────────────────────────────────────────────────────────────
    document.title = title;

    // ── Favicon override ──────────────────────────────────────────────────
    // To reliably change the favicon in Chrome/Firefox we must:
    //   1. Physically remove all existing icon links (renaming rel is not enough —
    //      the browser keeps the cached icon in memory).
    //   2. Inject a fresh link with a cache-busting query so the browser fetches
    //      the new file even if it previously cached the old one.
    const existingFaviconLinks = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]'),
    );
    let injectedFavicon: HTMLLinkElement | null = null;
    if (favicon) {
      existingFaviconLinks.forEach((l) => l.remove());
      injectedFavicon = document.createElement('link');
      injectedFavicon.rel = 'icon';
      injectedFavicon.type = 'image/png';
      injectedFavicon.href = `${favicon}?v=${Date.now()}`;
      document.head.appendChild(injectedFavicon);
    }

    // ── Meta description ───────────────────────────────────────────────────
    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;

    // ── Open Graph ─────────────────────────────────────────────────────────
    const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
    if (ogTitle) ogTitle.content = title;

    const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
    if (ogDesc) ogDesc.content = description;

    if (canonical) {
      const ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
      if (ogUrl) ogUrl.content = canonical;
    }

    // ── Canonical ──────────────────────────────────────────────────────────
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = canonical;
    }

    // ── hreflang alternates ────────────────────────────────────────────────
    // Remove any previously injected hreflang tags before re-inserting
    document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());

    if (alternates) {
      const { en, he } = alternates;
      const xDefault = en ?? he; // prefer EN as x-default, fall back to HE-only

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

    // Cleanup: remove injected favicon, restore originals, remove hreflang links
    return () => {
      if (favicon) {
        injectedFavicon?.remove();
        existingFaviconLinks.forEach((l) => document.head.appendChild(l));
      }
      document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());
    };
  }, [title, description, canonical, favicon, alternates?.en, alternates?.he]);
}

// Re-export so callers don't need a separate import
export type { SEOProps };
