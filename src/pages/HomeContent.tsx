import { useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import PartnerBubbles from '../components/PartnerBubbles';
import LanguageSwitcher from '../components/LanguageSwitcher';

// Lazy load heavy components below the fold
const Features = lazy(() => import('../components/Features'));
const Stats = lazy(() => import('../components/Stats'));
const GlobalSection = lazy(() => import('../components/GlobalSection'));
const Testimonials = lazy(() => import('../components/Testimonials'));
const CTA = lazy(() => import('../components/CTA'));
const Footer = lazy(() => import('../components/Footer'));
const ContactSalesButton = lazy(() => import('../components/ContactSalesButton'));
const LiveChat = lazy(() => import('../components/LiveChat'));

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

export default function HomeContent() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { t, direction, language } = useLanguage();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar />
      <Hero />

      {/* Partner Logos Row */}
      <section className="relative z-0 bg-white py-10 md:py-40 border-b border-slate-200 overflow-hidden -mt-28 md:mt-0 mobile-logos-clip">
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

      <Suspense fallback={<FeaturesSkeleton />}>
        <Features />
      </Suspense>
      <Suspense fallback={<div className="h-96" />}>
        <Stats />
      </Suspense>
      <Suspense fallback={<div className="h-screen" />}>
        <GlobalSection />
      </Suspense>
      <Suspense fallback={<div className="h-screen" />}>
        <Testimonials />
      </Suspense>

      {/* Gray section with partner ecosystem */}
      <section className="relative pt-0 pb-8 overflow-hidden">
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

      <Suspense fallback={<div className="h-screen" />}>
        <CTA />
      </Suspense>

      {/* White section before footer */}
      <section className="py-32 bg-white">
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
            >
              {t.cta.startNow}
              <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                <ArrowRight size={16} className={`inline ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
              </span>
            </Link>
            <a
              href="#"
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 font-medium px-8 py-4 rounded-lg transition-all text-sm"
            >
              {t.cta.contactSales}
            </a>
          </div>
        </div>
      </section>

      <Suspense fallback={<div className="h-96" />}>
        <Footer />
      </Suspense>

      {/* Contact Sales Button - only show when chat is closed */}
      {!isChatOpen && (
        <Suspense fallback={null}>
          <ContactSalesButton onClick={() => setIsChatOpen(true)} />
        </Suspense>
      )}

      {/* Live Chat */}
      {isChatOpen && (
        <Suspense fallback={null}>
          <LiveChat
            onClose={() => setIsChatOpen(false)}
            onMinimize={() => setIsChatOpen(false)}
          />
        </Suspense>
      )}

      {/* Language Switcher */}
      <LanguageSwitcher />
    </div>
  );
}
