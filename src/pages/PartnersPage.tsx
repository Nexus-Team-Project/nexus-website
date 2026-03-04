import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import PartnerCard, { type Partner } from '../components/PartnerCard';
import PartnerRingsAnimation from '../components/PartnerRingsAnimation';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

const Footer = lazy(() => import('../components/Footer'));

// ─── Constants ────────────────────────────────────────────────
const ITEMS_PER_PAGE = 12;

// ─── Types ───────────────────────────────────────────────────
interface PartnersResponse {
  partners: Partner[];
  total: number;
}

type SortBy = 'default' | 'az' | 'za';

// ─── Component ───────────────────────────────────────────────
export default function PartnersPage() {
  const { t, language, direction } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const isLoggedIn = !!user;

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [currentPage, setCurrentPage] = useState(1);

  const pT = (t as any).partnersPage as Record<string, string>;

  // Fetch partners (waits for auth to resolve so the token is ready)
  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PartnersResponse>('/api/partners');
      setPartners(res.partners);
    } catch {
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    fetchPartners();
  }, [authLoading, fetchPartners]);

  // Reset to page 1 whenever filters or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, sortBy]);

  // Unique sorted categories from all partners
  const categories = useMemo(() => {
    const set = new Set<string>();
    partners.forEach((p) => p.categories.forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }, [partners]);

  // Client-side filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return partners.filter((p) => {
      const matchSearch = !q || p.title.toLowerCase().includes(q);
      const matchCat = !selectedCategory || p.categories.includes(selectedCategory);
      return matchSearch && matchCat;
    });
  }, [partners, search, selectedCategory]);

  // Client-side sort
  const sorted = useMemo(() => {
    if (sortBy === 'az') return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === 'za') return [...filtered].sort((a, b) => b.title.localeCompare(a.title));
    return filtered;
  }, [filtered, sortBy]);

  // Pagination
  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sorted.slice(start, start + ITEMS_PER_PAGE);
  }, [sorted, currentPage]);

  const signupLink = language === 'he' ? '/he/signup' : '/signup';

  return (
    <div dir={direction} className="min-h-screen bg-slate-50">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="relative pt-36 pb-36 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0A2540 0%, #1a1f5e 60%, #0A2540 100%)' }}
      >
        {/* Decorative blob */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #635BFF 0%, transparent 70%)' }}
        />

        {/* Rotating partner logo rings */}
        {partners.length > 0 && <PartnerRingsAnimation partners={partners} language={language} />}

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className={direction === 'rtl' ? 'max-w-3xl ml-auto text-right' : 'max-w-3xl mx-auto text-center'}>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
              {pT?.heroTitle ?? 'Find a Nexus partner'}
            </h1>
            <p className={`text-lg text-white/70 max-w-xl mb-8 ${direction === 'rtl' ? '' : 'mx-auto'}`}>
              {pT?.heroSubtitle ?? 'Leading brands with exclusive discounts for community members'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Sticky Filter Bar ──────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">

          {/* Search */}
          <div className="relative flex-shrink-0 w-full sm:w-64">
            <Search
              size={15}
              className="absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              style={direction === 'rtl' ? { right: '12px' } : { left: '12px' }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={pT?.searchPlaceholder ?? (language === 'he' ? 'חפש מותג...' : 'Search brand...')}
              className="w-full border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-all py-2"
              style={direction === 'rtl' ? { paddingRight: '36px', paddingLeft: '12px' } : { paddingLeft: '36px', paddingRight: '12px' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                style={direction === 'rtl' ? { left: '10px' } : { right: '10px' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border border-slate-200 rounded-xl text-sm text-slate-700 bg-slate-50
                       focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple
                       py-2 px-3 cursor-pointer"
            dir={direction}
          >
            <option value="">{pT?.allCategories ?? (language === 'he' ? 'כל הקטגוריות' : 'All categories')}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Sort dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 whitespace-nowrap">
              {language === 'he' ? 'לסדר לפי' : 'Sort by'}
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="border border-slate-200 rounded-xl text-sm text-slate-700 bg-slate-50
                         focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple
                         py-2 px-3 cursor-pointer"
              dir={direction}
            >
              <option value="default">{pT?.sortDefault ?? (language === 'he' ? 'המלצה' : 'Recommended')}</option>
              <option value="az">{pT?.sortAZ ?? (language === 'he' ? 'א–ת' : 'A–Z')}</option>
              <option value="za">{pT?.sortZA ?? (language === 'he' ? 'ת–א' : 'Z–A')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Partner Grid ─────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

        {/* Count */}
        {!loading && (
          <p className="text-sm text-slate-500 mb-6">
            {language === 'he'
              ? `מציג ${sorted.length} שיתופי פעולה`
              : `Showing ${sorted.length} partnerships`}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 overflow-hidden animate-pulse">
                <div className="h-36 bg-slate-100" />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="mt-3 h-8 bg-slate-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results */}
        {!loading && sorted.length === 0 && (
          <div className="text-center py-24">
            <p className="text-slate-500 text-lg font-medium mb-2">
              {pT?.noResults ?? (language === 'he' ? 'לא נמצאו תוצאות' : 'No results found')}
            </p>
            <p className="text-slate-400 text-sm">
              {pT?.noResultsHint ?? (language === 'he' ? 'נסה מונח חיפוש אחר' : 'Try a different search term')}
            </p>
            <button
              onClick={() => { setSearch(''); setSelectedCategory(''); setSortBy('default'); }}
              className="mt-4 text-stripe-purple text-sm font-semibold hover:underline"
            >
              {language === 'he' ? 'נקה סינון' : 'Clear filters'}
            </button>
          </div>
        )}

        {/* Grid */}
        {!loading && sorted.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map((partner) => (
              <PartnerCard key={partner.id} partner={partner} isLoggedIn={isLoggedIn} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className={`flex gap-2 justify-center mt-8 flex-wrap ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                  currentPage === page
                    ? 'bg-stripe-purple text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-stripe-purple hover:text-stripe-purple'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        )}

        {/* Guest CTA banner */}
        {!isLoggedIn && !loading && sorted.length > 0 && (
          <div className="mt-12 bg-gradient-to-r from-stripe-blue to-violet-900 rounded-2xl p-8 text-white text-center">
            <h2 className="text-xl font-bold mb-2">
              {language === 'he' ? 'הצטרפו לקהילת Nexus וגלו את כל ההטבות' : 'Join Nexus Community and unlock all benefits'}
            </h2>
            <p className="text-white/70 mb-6 text-sm">
              {language === 'he'
                ? 'הנחות בלעדיות, שותפויות מובילות, וכלים לניהול הטבות ארגוניות'
                : 'Exclusive discounts, leading partnerships, and corporate benefits management'}
            </p>
            <Link
              to={signupLink}
              className="inline-block bg-stripe-purple text-white font-semibold px-8 py-3 rounded-xl hover:bg-violet-500 transition-colors"
            >
              {pT?.joinNow ?? (language === 'he' ? 'הצטרפות חינם' : 'Join free')}
            </Link>
          </div>
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <Suspense fallback={<div className="h-40 bg-slate-900" />}>
        <Footer />
      </Suspense>
    </div>
  );
}
