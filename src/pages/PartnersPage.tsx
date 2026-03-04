import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import PartnerCard, { type Partner } from '../components/PartnerCard';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────
interface PartnersResponse {
  partners: Partner[];
  total: number;
}

// ─── Component ───────────────────────────────────────────────
export default function PartnersPage() {
  const { t, language, direction } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();
  const isLoggedIn = !!user;

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

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

  const loginLink = language === 'he' ? '/he/login' : '/login';
  const signupLink = language === 'he' ? '/he/signup' : '/signup';

  return (
    <div dir={direction} className="min-h-screen bg-slate-50">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="relative pt-28 pb-20 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0A2540 0%, #1a1f5e 60%, #0A2540 100%)' }}
      >
        {/* Decorative blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #635BFF 0%, transparent 70%)' }} />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Users size={14} />
            <span>{partners.length > 0 ? `${partners.length}+ ` : ''}{pT?.partnersCount ?? 'Partnerships'}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
            {pT?.heroTitle ?? 'Exclusive Benefits for Nexus Community'}
          </h1>
          <p className="text-lg text-white/70 max-w-xl mx-auto mb-8">
            {pT?.heroSubtitle ?? 'Leading brands with exclusive discounts for community members'}
          </p>

          {!isLoggedIn && (
            <div className={`flex flex-wrap gap-3 justify-center ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <Link
                to={signupLink}
                className="bg-stripe-purple text-white font-semibold px-6 py-3 rounded-xl hover:bg-violet-500 transition-colors"
              >
                {pT?.joinNow ?? (language === 'he' ? 'הצטרפות חינם' : 'Join free')}
              </Link>
              <Link
                to={loginLink}
                className="bg-white/10 border border-white/30 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors"
              >
                {t.navbar.signIn}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Sticky Filter Bar ──────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">

          {/* Search */}
          <div className="relative flex-shrink-0 w-full sm:w-64">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
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

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                !selectedCategory
                  ? 'bg-stripe-purple text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {pT?.allCategories ?? (language === 'he' ? 'הכל' : 'All')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-stripe-purple text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Partner Grid ─────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

        {/* Count */}
        {!loading && (
          <p className="text-sm text-slate-500 mb-6">
            {language === 'he'
              ? `מציג ${filtered.length} שיתופי פעולה`
              : `Showing ${filtered.length} partnerships`}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
                <div className="h-28 bg-slate-100" />
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
        {!loading && filtered.length === 0 && (
          <div className="text-center py-24">
            <p className="text-slate-500 text-lg font-medium mb-2">
              {pT?.noResults ?? (language === 'he' ? 'לא נמצאו תוצאות' : 'No results found')}
            </p>
            <p className="text-slate-400 text-sm">
              {pT?.noResultsHint ?? (language === 'he' ? 'נסה מונח חיפוש אחר' : 'Try a different search term')}
            </p>
            <button
              onClick={() => { setSearch(''); setSelectedCategory(''); }}
              className="mt-4 text-stripe-purple text-sm font-semibold hover:underline"
            >
              {language === 'he' ? 'נקה סינון' : 'Clear filters'}
            </button>
          </div>
        )}

        {/* Grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((partner) => (
              <PartnerCard key={partner.id} partner={partner} isLoggedIn={isLoggedIn} />
            ))}
          </div>
        )}

        {/* Guest CTA banner */}
        {!isLoggedIn && !loading && filtered.length > 0 && (
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
    </div>
  );
}
