import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import PartnerBubbles from '../components/PartnerBubbles';

import { useSectionVisible } from '../hooks/useSectionVisible';
import { useAnalytics } from '../hooks/useAnalytics';
import { MARKETING } from '../lib/analyticsEvents';

// Lazy load heavy components below the fold
const Features = lazy(() => import('../components/Features'));
const Stats = lazy(() => import('../components/Stats'));
const GlobalSection = lazy(() => import('../components/GlobalSection'));
const Testimonials = lazy(() => import('../components/Testimonials'));
const CTA = lazy(() => import('../components/CTA'));
const Footer = lazy(() => import('../components/Footer'));

// ─── Skeleton Components ──────────────────────────────────────────────────────

function FeaturesSkeleton() {
  return (
    <section className="pt-32 pb-16 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header skeleton */}
        <div className="mb-12">
          <div className="h-9 w-72 bg-slate-200 rounded-lg animate-pulse mb-4" />
          <div className="h-5 w-96 bg-slate-100 rounded-lg animate-pulse" />
        </div>

        {/* Bento Grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[340px]">
          {/* Card 1 - tall */}
          <div className="md:col-span-5 md:row-span-2 rounded-lg border border-slate-200 bg-gradient-to-tr from-orange-50/50 to-orange-100/20 p-8 animate-pulse">
            <div className="h-6 w-40 bg-slate-200 rounded mb-6" />
            <div className="space-y-3 mt-12">
              <div className="h-32 w-full bg-white/60 rounded-xl" />
              <div className="h-10 w-full bg-white/40 rounded-lg" />
            </div>
          </div>

          {/* Card 2 */}
          <div className="md:col-span-7 md:row-span-1 md:col-start-6 rounded-lg border border-slate-200 bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6 animate-pulse">
            <div className="h-6 w-48 bg-slate-200 rounded mb-4" />
            <div className="h-48 w-full bg-white/40 rounded-xl" />
          </div>

          {/* Card 3 */}
          <div className="md:col-span-7 md:col-start-6 rounded-lg border border-slate-200 bg-gradient-to-br from-cyan-50 via-blue-50/80 to-purple-50 p-8 animate-pulse">
            <div className="h-6 w-36 bg-slate-200 rounded mb-4" />
            <div className="h-48 w-full bg-white/30 rounded-xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsSkeleton() {
  return (
    <section className="py-24 bg-stripe-light">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-3 animate-pulse">
              <div className="h-14 w-36 bg-slate-300 rounded-xl" />
              <div className="h-4 w-28 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GlobalSectionSkeleton() {
  return (
    <section className="relative py-20 md:py-48 overflow-x-hidden">
      <div className="absolute inset-0 bg-stripe-blue" />
      <div className="relative max-w-7xl mx-auto px-6 animate-pulse">
        <div className="grid lg:grid-cols-2 gap-16 items-center min-h-[320px]">
          <div className="space-y-4">
            <div className="h-5 w-32 bg-white/20 rounded" />
            <div className="h-10 w-72 bg-white/25 rounded-lg" />
            <div className="h-10 w-56 bg-white/20 rounded-lg" />
            <div className="space-y-2 mt-6">
              <div className="h-4 w-80 bg-white/15 rounded" />
              <div className="h-4 w-64 bg-white/10 rounded" />
              <div className="h-4 w-72 bg-white/10 rounded" />
            </div>
            <div className="flex gap-3 mt-6">
              <div className="h-12 w-36 bg-stripe-purple/40 rounded-lg" />
              <div className="h-12 w-28 bg-white/10 rounded-lg" />
            </div>
          </div>
          <div className="hidden lg:flex items-center justify-center">
            <div className="w-80 h-80 bg-white/5 rounded-full border border-white/10" />
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSkeleton() {
  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16 animate-pulse">
          <div className="h-5 w-32 bg-slate-200 rounded mx-auto mb-4" />
          <div className="h-10 w-64 bg-slate-200 rounded-lg mx-auto mb-3" />
          <div className="h-4 w-80 bg-slate-100 rounded mx-auto" />
        </div>
        {/* Photo columns */}
        <div className="flex gap-4 justify-center overflow-hidden h-72">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-4 animate-pulse"
              style={{ transform: `translateY(${[10, -5, 16, -10, 4][i]}px)` }}
            >
              {[0, 1, 2].map((j) => (
                <div key={j} className="w-20 h-20 bg-slate-200 rounded-full flex-shrink-0" />
              ))}
            </div>
          ))}
        </div>
        {/* CTA skeleton */}
        <div className="mt-12 flex justify-center animate-pulse">
          <div className="h-12 w-48 bg-slate-200 rounded-lg" />
        </div>
      </div>
    </section>
  );
}

function CTASkeleton() {
  return (
    <section className="py-24 bg-stripe-blue">
      <div className="max-w-7xl mx-auto px-6 animate-pulse">
        <div className="grid lg:grid-cols-2 gap-16 items-center min-h-[340px]">
          <div className="space-y-4">
            <div className="h-5 w-24 bg-white/20 rounded" />
            <div className="h-10 w-72 bg-white/25 rounded-lg" />
            <div className="h-10 w-56 bg-white/20 rounded-lg" />
            <div className="space-y-2 mt-4">
              <div className="h-4 w-80 bg-white/15 rounded" />
              <div className="h-4 w-64 bg-white/10 rounded" />
            </div>
            <div className="mt-6">
              <div className="h-12 w-40 bg-stripe-purple/50 rounded-lg" />
            </div>
          </div>
          <div className="h-72 bg-white/5 rounded-2xl border border-white/10 p-6">
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="h-3 bg-white/10 rounded"
                  style={{ width: `${65 + Math.sin(i * 1.3) * 25}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FooterSkeleton() {
  return (
    <footer className="bg-stripe-blue py-16">
      <div className="max-w-7xl mx-auto px-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
          {/* Logo column */}
          <div className="col-span-2 md:col-span-1">
            <div className="h-8 w-24 bg-white/20 rounded mb-6" />
            <div className="space-y-2">
              <div className="h-3 w-32 bg-white/10 rounded" />
              <div className="h-3 w-28 bg-white/10 rounded" />
            </div>
          </div>
          {/* Link columns */}
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-4 w-20 bg-white/20 rounded mb-4" />
              {[0, 1, 2, 3, 4].map((j) => (
                <div key={j} className="h-3 w-16 bg-white/10 rounded mb-3" />
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 pt-8 flex justify-between items-center">
          <div className="h-3 w-48 bg-white/10 rounded" />
          <div className="flex gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 w-16 bg-white/10 rounded" />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomeContent() {
  const { t, direction, language } = useLanguage();
  const { track } = useAnalytics();

  // Differential loading: each section's JS chunk only loads when the user
  // is within rootMargin distance of that section. '400px 0px' means 400px
  // before the section enters the viewport — enough time to load without flicker.
  const [statsRef, statsVisible] = useSectionVisible('400px 0px');
  const [globalRef, globalVisible] = useSectionVisible('400px 0px');
  const [testimonialsRef, testimonialsVisible] = useSectionVisible('400px 0px');
  const [ctaRef, ctaVisible] = useSectionVisible('400px 0px');
  const [footerRef, footerVisible] = useSectionVisible('300px 0px');

  // Scroll-reveal: observe all .scroll-reveal elements, including lazily mounted ones
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );

    const observeAll = () => {
      document.querySelectorAll('.scroll-reveal:not(.revealed)').forEach((el) => observer.observe(el));
    };

    observeAll();

    // Re-run when lazy-loaded sections mount
    const mutationObserver = new MutationObserver(observeAll);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen [overflow-x:clip]">
      <Navbar />
      <Hero />

      {/* Partner Logos Row */}
      <section className="scroll-reveal relative z-0 bg-white py-10 md:py-40 border-b border-slate-200 overflow-hidden -mt-28 md:mt-0 mobile-logos-clip">
        {/* Vertical Grid Lines Background */}
        <div className="absolute inset-0 z-0 flex justify-center pointer-events-none opacity-30 overflow-hidden">
          <div className="flex space-x-24 h-full max-w-full">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="w-px h-full bg-gradient-to-b from-transparent via-stripe-purple/20 to-transparent"
              />
            ))}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          {/* Desktop - static row */}
          <div className="hidden md:flex items-center justify-center gap-10 lg:gap-12">
            <img
              src="/partner-1.png"
              alt="Partner 1"
              className="h-48 lg:h-56 w-auto object-contain opacity-100 hover:opacity-70 transition-all hover:grayscale"
              loading="lazy"
            />
            <img
              src="/partner-2.png"
              alt="Partner 2"
              className="h-10 lg:h-12 w-auto object-contain opacity-100 hover:opacity-70 transition-all hover:grayscale"
              loading="lazy"
            />
            <img
              src="/partner-3.png"
              alt="Partner 3"
              className="h-14 w-auto object-contain opacity-100 hover:opacity-70 transition-all hover:grayscale"
              loading="lazy"
            />
            <img
              src="/partner-4.png"
              alt="Partner 4"
              className="h-20 lg:h-24 w-auto object-contain opacity-100 hover:opacity-70 transition-all hover:grayscale"
              loading="lazy"
            />
          </div>

          {/* Mobile - auto-scrolling slider */}
          <div className="md:hidden overflow-hidden">
            <div className={`${direction === 'rtl' ? 'partner-slider' : 'partner-slider-reverse'} flex items-center gap-12 w-max`}>
              {[1, 2, 3, 4, 1, 2, 3, 4].map((num, i) => (
                <img
                  key={i}
                  src={`/partner-${num}.png`}
                  alt={`Partner ${num}`}
                  className={`${num === 1 ? 'h-32' : num === 4 ? 'h-14' : 'h-8'} w-auto object-contain flex-shrink-0`}
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features — rendered immediately (just below fold), skeleton while loading */}
      <Suspense fallback={<FeaturesSkeleton />}>
        <Features />
      </Suspense>

      {/* Stats — differential loading */}
      <div ref={statsRef}>
        {statsVisible ? (
          <Suspense fallback={<StatsSkeleton />}>
            <Stats />
          </Suspense>
        ) : (
          <StatsSkeleton />
        )}
      </div>

      {/* GlobalSection — differential loading */}
      <div ref={globalRef}>
        {globalVisible ? (
          <Suspense fallback={<GlobalSectionSkeleton />}>
            <GlobalSection />
          </Suspense>
        ) : (
          <GlobalSectionSkeleton />
        )}
      </div>

      {/* Testimonials — differential loading */}
      <div ref={testimonialsRef}>
        {testimonialsVisible ? (
          <Suspense fallback={<TestimonialsSkeleton />}>
            <Testimonials />
          </Suspense>
        ) : (
          <TestimonialsSkeleton />
        )}
      </div>

      {/* Partner ecosystem section — always rendered (lightweight) */}
      <section className="scroll-reveal relative pt-0 pb-8 overflow-hidden">
        {/* Diagonal background */}
        <div
          className="absolute inset-0 bg-slate-100"
          style={{
            clipPath: direction === 'rtl'
              ? 'polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 100px))'
              : 'polygon(0 0, 100% 0, 100% calc(100% - 100px), 0 100%)',
          }}
        />

        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 items-center">
            {/* Left: Content */}
            <div>
              <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4">
                {t.partners.title}
              </p>
              <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-6 leading-tight">
                {t.partners.heading}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                {t.partners.description}
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-stripe-purple/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full bg-stripe-purple" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">{t.partners.universalIntegration}</h3>
                    <p className="text-sm text-slate-600">{t.partners.universalIntegrationDesc}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-stripe-purple/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full bg-stripe-purple" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">{t.partners.trustedPartners}</h3>
                    <p className="text-sm text-slate-600">{t.partners.trustedPartnersDesc}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-stripe-purple/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full bg-stripe-purple" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">{t.partners.globalReach}</h3>
                    <p className="text-sm text-slate-600">{t.partners.globalReachDesc}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Rising Bubbles */}
            <div className="relative h-[400px] md:h-[800px] -mx-6 md:mx-0 overflow-hidden">
              <PartnerBubbles />
            </div>
          </div>
        </div>
      </section>

      {/* CTA — differential loading */}
      <div ref={ctaRef}>
        {ctaVisible ? (
          <Suspense fallback={<CTASkeleton />}>
            <CTA />
          </Suspense>
        ) : (
          <CTASkeleton />
        )}
      </div>

      {/* White section before footer — always rendered (lightweight) */}
      <section className="scroll-reveal py-32 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl lg:text-6xl font-bold text-slate-900 tracking-tight mb-6">
            {t.cta.title}
          </h2>
          <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">
            {t.cta.description}
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to={language === 'he' ? '/he/signup' : '/signup'}
              className="group inline-flex items-center gap-2 bg-stripe-purple hover:bg-stripe-purple/90 text-white font-medium px-8 py-4 rounded-lg transition-all hover:shadow-xl hover:shadow-stripe-purple/25 text-sm"
              onClick={() => track(MARKETING.HERO_CTA_CLICKED, 'MARKETING', { button_text: t.cta.startNow, variant: 'bottom_cta' })}
            >
              {t.cta.startNow}
              <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                <ArrowRight size={16} className={`inline ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
              </span>
            </Link>
            <a
              href="#"
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 font-medium px-8 py-4 rounded-lg transition-all text-sm"
              onClick={(e) => { e.preventDefault(); setIsChatOpen(true); }}
            >
              {t.cta.contactSales}
            </a>
          </div>
        </div>
      </section>

      {/* Footer — differential loading */}
      <div ref={footerRef}>
        {footerVisible ? (
          <Suspense fallback={<FooterSkeleton />}>
            <Footer />
          </Suspense>
        ) : (
          <FooterSkeleton />
        )}
      </div>
    </div>
  );
}
