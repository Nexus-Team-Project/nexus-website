import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight, Tag } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getArticles } from '../data/blog';
import type { Article, ArticleCategory } from '../data/blog';

const CATEGORY_COLORS: Record<ArticleCategory, string> = {
  gifts: 'bg-purple-100 text-purple-700',
  benefits: 'bg-blue-100 text-blue-700',
  loyalty: 'bg-emerald-100 text-emerald-700',
};

const HERO_GRADIENTS: Record<ArticleCategory, string> = {
  gifts: 'from-purple-600 to-indigo-700',
  benefits: 'from-blue-600 to-cyan-700',
  loyalty: 'from-emerald-600 to-teal-700',
};

export default function BlogListContent() {
  const { t, language, direction } = useLanguage();
  const isRTL = direction === 'rtl';
  const prefix = language === 'he' ? '/he' : '';

  const articles = getArticles(language);
  const [activeCategory, setActiveCategory] = useState<ArticleCategory | 'all'>('all');

  const filtered =
    activeCategory === 'all'
      ? articles
      : articles.filter((a) => a.category === activeCategory);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  // Set document title
  useEffect(() => {
    document.title =
      language === 'he'
        ? 'בלוג | Nexus – תשתיות נאמנות ותשלומים'
        : 'Blog | Nexus – Loyalty & Payments Infrastructure';
  }, [language]);

  const categoryLabel = (cat: ArticleCategory | 'all') => {
    const labels: Record<string, Record<string, string>> = {
      he: { all: 'הכל', gifts: 'מתנות לעובדים', benefits: 'מועדון הטבות', loyalty: 'נאמנות ותשלומים' },
      en: { all: 'All', gifts: 'Employee Gifts', benefits: 'Benefits Club', loyalty: 'Loyalty & Payments' },
    };
    return labels[language]?.[cat] ?? cat;
  };

  return (
    <div className="min-h-screen bg-white" dir={direction}>
      <Navbar variant="dark" />

      {/* ─── Hero Section ─── */}
      <section className="pt-32 pb-16 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#635BFF]/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {language === 'he' ? 'הבלוג של Nexus' : 'The Nexus Blog'}
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl">
            {language === 'he'
              ? 'מדריכים מעשיים, תובנות מהשטח ופרקטיקות מובילות בעולם ההטבות, הנאמנות והתשלומים לארגונים.'
              : 'Practical guides, real-world insights, and best practices in organizational benefits, loyalty, and payments.'}
          </p>
        </div>
      </section>

      {/* ─── Category Tabs ─── */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {(['all', 'gifts', 'benefits', 'loyalty'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  activeCategory === cat
                    ? 'border-[#635BFF] text-[#635BFF]'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ─── Featured Article ─── */}
      {featured && (
        <section className="max-w-7xl mx-auto px-6 py-12">
          <Link
            to={`${prefix}/blog/${featured.slug}`}
            className="group block rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-lg transition-shadow"
          >
            <div className="grid md:grid-cols-5 gap-0">
              {/* Image / gradient placeholder */}
              <div className={`md:col-span-3 relative h-64 md:h-auto bg-gradient-to-br ${HERO_GRADIENTS[featured.category]}`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Tag className="w-20 h-20 text-white/20" />
                </div>
              </div>

              {/* Content */}
              <div className="md:col-span-2 p-8 flex flex-col justify-center">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-4 w-fit ${
                    CATEGORY_COLORS[featured.category]
                  }`}
                >
                  {categoryLabel(featured.category)}
                </span>
                <h2 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-[#635BFF] transition-colors">
                  {featured.title}
                </h2>
                <p className="text-slate-600 mb-4 line-clamp-3">{featured.excerpt}</p>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {featured.readTime} {language === 'he' ? 'דק\' קריאה' : 'min read'}
                  </span>
                  <span>{new Date(featured.publishDate).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ─── Article Grid ─── */}
      {rest.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pb-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {rest.map((article) => (
              <ArticleCard
                key={article.slug}
                article={article}
                prefix={prefix}
                language={language}
                categoryLabel={categoryLabel(article.category)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Empty State ─── */}
      {filtered.length === 0 && (
        <div className="max-w-7xl mx-auto px-6 py-20 text-center">
          <p className="text-slate-500 text-lg">
            {language === 'he' ? 'אין מאמרים בקטגוריה זו עדיין.' : 'No articles in this category yet.'}
          </p>
        </div>
      )}

      <Footer />
    </div>
  );
}

/* ─── Article Card ─── */
function ArticleCard({
  article,
  prefix,
  language,
  categoryLabel,
}: {
  article: Article;
  prefix: string;
  language: string;
  categoryLabel: string;
}) {
  return (
    <Link
      to={`${prefix}/blog/${article.slug}`}
      className="group flex flex-col rounded-2xl overflow-hidden border border-slate-200 bg-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
    >
      {/* Image placeholder */}
      <div
        className={`h-48 bg-gradient-to-br ${HERO_GRADIENTS[article.category]} relative`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Tag className="w-12 h-12 text-white/20" />
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1">
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-3 w-fit ${
            CATEGORY_COLORS[article.category]
          }`}
        >
          {categoryLabel}
        </span>
        <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-[#635BFF] transition-colors line-clamp-2">
          {article.title}
        </h3>
        <p className="text-sm text-slate-600 mb-4 line-clamp-3 flex-1">
          {article.excerpt}
        </p>

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {article.readTime} {language === 'he' ? 'דק\'' : 'min'}
          </span>
          <span className="flex items-center gap-1 text-[#635BFF] font-medium group-hover:gap-2 transition-all">
            {language === 'he' ? 'קרא עוד' : 'Read more'}
            <ArrowRight className={`w-4 h-4 ${language === 'he' ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </div>
    </Link>
  );
}
