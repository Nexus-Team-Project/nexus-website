import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, ArrowLeft, ArrowRight, Tag, ChevronRight, AlertCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getArticleBySlug, getArticles } from '../data/blog';
import type { Article, ArticleSection } from '../data/blog';

/* ─── Category helpers ─── */
const CATEGORY_COLORS: Record<string, string> = {
  gifts: 'bg-purple-100 text-purple-700',
  benefits: 'bg-blue-100 text-blue-700',
  loyalty: 'bg-emerald-100 text-emerald-700',
};
const HERO_GRADIENTS: Record<string, string> = {
  gifts: 'from-purple-600 to-indigo-700',
  benefits: 'from-blue-600 to-cyan-700',
  loyalty: 'from-emerald-600 to-teal-700',
};

export default function ArticleContent() {
  const { slug } = useParams<{ slug: string }>();
  const { t, language, direction } = useLanguage();
  const isRTL = direction === 'rtl';
  const prefix = language === 'he' ? '/he' : '';

  const article = slug ? getArticleBySlug(slug, language) : undefined;
  const allArticles = getArticles(language);

  /* Related articles = other articles in the same category (or just the rest) */
  const related = useMemo(() => {
    if (!article) return [];
    return allArticles.filter((a) => a.slug !== article.slug).slice(0, 2);
  }, [article, allArticles]);

  /* ─── TOC: headings extracted from sections ─── */
  const headings = useMemo(() => {
    if (!article) return [];
    return article.sections.filter(
      (s): s is Extract<ArticleSection, { type: 'heading'; level: 2 }> =>
        s.type === 'heading' && s.level === 2,
    );
  }, [article]);

  /* ─── Active TOC heading via IntersectionObserver ─── */
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!article) return;
    const ids = headings.map((h) => h.id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActiveId(e.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    );
    els.forEach((el) => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, [article, headings]);

  /* ─── SEO: JSON-LD ─── */
  useEffect(() => {
    if (!article) return;
    document.title = article.metaTitle;

    // Set meta description
    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = article.metaDescription;

    // JSON-LD BlogPosting
    const jsonLd: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.metaDescription,
      datePublished: article.publishDate,
      author: { '@type': 'Organization', name: article.author.name },
      publisher: { '@type': 'Organization', name: 'Nexus' },
      inLanguage: language === 'he' ? 'he-IL' : 'en-US',
    };

    // FAQPage
    const faqLd =
      article.faq.length > 0
        ? {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: article.faq.map((f) => ({
              '@type': 'Question',
              name: f.question,
              acceptedAnswer: { '@type': 'Answer', text: f.answer },
            })),
          }
        : null;

    const scriptId = 'blog-jsonld';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    const payload = faqLd ? [jsonLd, faqLd] : jsonLd;
    script.textContent = JSON.stringify(payload);

    return () => {
      script?.remove();
    };
  }, [article, language]);

  /* ─── 404 ─── */
  if (!article) {
    return (
      <div className="min-h-screen bg-white" dir={direction}>
        <Navbar variant="dark" />
        <div className="max-w-3xl mx-auto px-6 py-32 text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            {language === 'he' ? 'המאמר לא נמצא' : 'Article not found'}
          </h1>
          <Link
            to={`${prefix}/blog`}
            className="text-[#635BFF] font-medium hover:underline"
          >
            {language === 'he' ? '← חזרה לבלוג' : '← Back to blog'}
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const categoryLabel: Record<string, Record<string, string>> = {
    he: { gifts: 'מתנות לעובדים', benefits: 'מועדון הטבות', loyalty: 'נאמנות ותשלומים' },
    en: { gifts: 'Employee Gifts', benefits: 'Benefits Club', loyalty: 'Loyalty & Payments' },
  };

  return (
    <div className="min-h-screen bg-white" dir={direction}>
      <Navbar variant="dark" />

      {/* ─── Hero ─── */}
      <section
        className={`pt-32 pb-16 relative overflow-hidden bg-gradient-to-br ${HERO_GRADIENTS[article.category]}`}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="max-w-4xl mx-auto px-6 relative z-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-white/70 mb-6">
            <Link to={`${prefix}/blog`} className="hover:text-white transition-colors">
              {language === 'he' ? 'בלוג' : 'Blog'}
            </Link>
            <ChevronRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
            <span className="text-white/90">{categoryLabel[language]?.[article.category]}</span>
          </nav>

          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-4 ${CATEGORY_COLORS[article.category]}`}
          >
            {categoryLabel[language]?.[article.category]}
          </span>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            {article.title}
          </h1>
          <p className="text-lg text-white/80 mb-6">{article.subtitle}</p>

          <div className="flex flex-wrap items-center gap-6 text-sm text-white/70">
            <span className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                {article.author.name.charAt(0)}
              </div>
              {article.author.name}
            </span>
            <span>
              {new Date(article.publishDate).toLocaleDateString(
                language === 'he' ? 'he-IL' : 'en-US',
                { year: 'numeric', month: 'long', day: 'numeric' },
              )}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {article.readTime} {language === 'he' ? 'דק\' קריאה' : 'min read'}
            </span>
          </div>
        </div>
      </section>

      {/* ─── Content + TOC ─── */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className={`flex gap-12 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {/* TOC Sidebar — desktop only */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <nav className="sticky top-24">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                {language === 'he' ? 'תוכן עניינים' : 'Table of Contents'}
              </h4>
              <ul className="space-y-2 border-s border-slate-200">
                {headings.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      className={`block ps-4 py-1 text-sm transition-colors border-s-2 -ms-px ${
                        activeId === h.id
                          ? 'border-[#635BFF] text-[#635BFF] font-medium'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Main Content */}
          <article className="flex-1 min-w-0 max-w-3xl">
            {article.sections.map((section, i) => (
              <SectionRenderer key={i} section={section} />
            ))}

            {/* ─── FAQ ─── */}
            {article.faq.length > 0 && (
              <div className="mt-16 pt-12 border-t border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900 mb-8">
                  {language === 'he' ? 'שאלות נפוצות' : 'Frequently Asked Questions'}
                </h2>
                <div className="space-y-6">
                  {article.faq.map((faq, i) => (
                    <details
                      key={i}
                      className="group rounded-xl border border-slate-200 overflow-hidden"
                    >
                      <summary className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-50 transition-colors">
                        <span className="font-medium text-slate-900">{faq.question}</span>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-open:rotate-90 transition-transform flex-shrink-0 ms-4" />
                      </summary>
                      <div className="px-6 pb-4 text-slate-600 leading-relaxed">
                        {faq.answer}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Author Card ─── */}
            <div className="mt-16 pt-12 border-t border-slate-200">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#635BFF] to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                  {article.author.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{article.author.name}</p>
                  <p className="text-sm text-slate-500">{article.author.role}</p>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>

      {/* ─── Related Articles ─── */}
      {related.length > 0 && (
        <section className="bg-slate-50 py-16">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-8">
              {language === 'he' ? 'מאמרים נוספים' : 'Related Articles'}
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={`${prefix}/blog/${r.slug}`}
                  className="group flex flex-col rounded-2xl overflow-hidden border border-slate-200 bg-white hover:shadow-lg transition-all"
                >
                  <div className={`h-40 bg-gradient-to-br ${HERO_GRADIENTS[r.category]} relative`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Tag className="w-10 h-10 text-white/20" />
                    </div>
                  </div>
                  <div className="p-6">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-3 ${CATEGORY_COLORS[r.category]}`}>
                      {categoryLabel[language]?.[r.category]}
                    </span>
                    <h3 className="font-semibold text-slate-900 group-hover:text-[#635BFF] transition-colors line-clamp-2">
                      {r.title}
                    </h3>
                    <p className="text-sm text-slate-600 mt-2 line-clamp-2">{r.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="text-center mt-10">
              <Link
                to={`${prefix}/blog`}
                className="inline-flex items-center gap-2 text-[#635BFF] font-medium hover:gap-3 transition-all"
              >
                {isRTL ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                {language === 'he' ? 'חזרה לכל המאמרים' : 'Back to all articles'}
              </Link>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Section Renderer — renders one ArticleSection
   ═══════════════════════════════════════════════════════════════════════════════ */

function SectionRenderer({ section }: { section: ArticleSection }) {
  switch (section.type) {
    case 'heading':
      if (section.level === 2) {
        return (
          <h2
            id={section.id}
            className="text-2xl font-bold text-slate-900 mt-12 mb-4 scroll-mt-24"
          >
            {section.text}
          </h2>
        );
      }
      return (
        <h3
          id={section.id}
          className="text-xl font-semibold text-slate-800 mt-8 mb-3 scroll-mt-24"
        >
          {section.text}
        </h3>
      );

    case 'paragraph':
      return (
        <p className="text-slate-600 leading-relaxed mb-4 text-base">
          {section.text}
        </p>
      );

    case 'list':
      if (section.ordered) {
        return (
          <ol className="list-decimal list-inside space-y-2 mb-6 text-slate-600 ps-4">
            {section.items.map((item, i) => (
              <li key={i} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="list-disc list-inside space-y-2 mb-6 text-slate-600 ps-4">
          {section.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );

    case 'callout':
      return (
        <div className="my-6 rounded-xl border-s-4 border-[#635BFF] bg-slate-50 p-5">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-[#635BFF] flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {section.text}
            </div>
          </div>
        </div>
      );

    case 'image':
      return (
        <figure className="my-8">
          <img
            src={section.src}
            alt={section.alt}
            className="rounded-xl w-full"
          />
          {section.caption && (
            <figcaption className="text-sm text-slate-500 mt-2 text-center">
              {section.caption}
            </figcaption>
          )}
        </figure>
      );

    default:
      return null;
  }
}
