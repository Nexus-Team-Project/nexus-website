import { useEffect } from 'react';

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

/**
 * Sets document title, meta description, canonical URL, og tags,
 * and hreflang alternate links for bilingual pages.
 */
export function useSEO({ title, description, canonical, alternates }: SEOProps) {
  useEffect(() => {
    document.title = title;

    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;

    const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
    if (ogTitle) ogTitle.content = title;

    const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
    if (ogDesc) ogDesc.content = description;

    if (canonical) {
      const ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
      if (ogUrl) ogUrl.content = canonical;

      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = canonical;
    }

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

    return () => {
      document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());
    };
  }, [title, description, canonical, alternates?.en, alternates?.he]);
}

// Re-export so callers don't need a separate import
export type { SEOProps };
