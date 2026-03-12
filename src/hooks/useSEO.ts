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
    // Hide existing favicon links and inject a fresh one with the correct type,
    // so the browser actually picks up the new icon (changing href on an svg link
    // doesn't work because the MIME type stays image/svg+xml).
    let injectedFavicon: HTMLLinkElement | null = null;
    const existingFaviconLinks = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
    );
    if (favicon) {
      existingFaviconLinks.forEach((l) => l.setAttribute('data-favicon-hidden', 'true'));
      existingFaviconLinks.forEach((l) => { l.rel = 'icon-disabled'; });
      injectedFavicon = document.createElement('link');
      injectedFavicon.rel = 'icon';
      injectedFavicon.type = 'image/png';
      injectedFavicon.href = favicon;
      injectedFavicon.setAttribute('data-favicon-override', 'true');
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

    // Cleanup: restore original favicons and remove hreflang links on unmount
    return () => {
      if (favicon) {
        injectedFavicon?.remove();
        existingFaviconLinks.forEach((l) => {
          l.rel = 'icon';
          l.removeAttribute('data-favicon-hidden');
        });
      }
      document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());
    };
  }, [title, description, canonical, favicon, alternates?.en, alternates?.he]);
}

// Re-export so callers don't need a separate import
export type { SEOProps };
