import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Lightbulb, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import AnimatedGradient from '../components/AnimatedGradient';
import BenefitsFeatureGrid from '../components/benefits/BenefitsFeatureGrid';
import BenefitsHowItWorks from '../components/benefits/BenefitsHowItWorks';
import BenefitsStats from '../components/benefits/BenefitsStats';
import StoryWalletCards from '../components/benefits/StoryWalletCards';
import StoryInsightsCarousel from '../components/benefits/StoryInsightsCarousel';
import StoryGiftCards from '../components/benefits/StoryGiftCards';
import StoryNearbyMap from '../components/benefits/StoryNearbyMap';
import { useLanguage } from '../i18n/LanguageContext';

const Footer = lazy(() => import('../components/Footer'));

// ─── scroll-reveal observer ────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('revealed'); observer.unobserve(e.target); }
      }),
      { threshold: 0.1 },
    );
    document.querySelectorAll('.scroll-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Gallery card data ────────────────────────────────────
const STORY_CARDS = [
  {
    id: 'wallet',
    titleHe: 'נרכז לקהילה שלך את כל ההטבות במקום אחד',
    titleEn: 'All Your Community Benefits in One Place',
    Component: StoryWalletCards,
  },
  {
    id: 'cashback',
    titleHe: 'נהפוך את ההוצאות של הקהילה שלך להכנסות',
    titleEn: 'Turn Your Community Spending into Revenue',
    Component: StoryInsightsCarousel,
  },
  {
    id: 'giftcards',
    titleHe: 'גיפט קארדס מהמותגים האהובים על הקהילה שלך',
    titleEn: "Gift Cards from Your Community's Favorite Brands",
    Component: StoryGiftCards,
  },
  {
    id: 'nearby',
    titleHe: 'נציג לקהילה שלך את ההטבות הקרובות אליהם',
    titleEn: 'Show Your Community Deals Near Them',
    Component: StoryNearbyMap,
  },
];

// ─── "Why" reasons data ──────────────────────────────────
const WHY_REASONS = [
  {
    icon: AlertTriangle,
    titleHe: 'האתגר', titleEn: 'The Challenge',
    descHe: 'ארגונים מתקשים לשמר חברים לאורך זמן. חוסר ערך יומיומי גורם לנטישה ולחוסר מעורבות.',
    descEn: 'Organizations struggle to retain members long-term. Lack of daily value leads to churn and disengagement.',
  },
  {
    icon: Lightbulb,
    titleHe: 'הפתרון', titleEn: 'The Solution',
    descHe: 'מועדון הטבות ממותג שמרכז מאות הנחות, קאשבק וגיפט קארדס — ערך כלכלי יומיומי שמחזיק את הקהילה מחוברת.',
    descEn: 'A branded benefits club with hundreds of discounts, cashback and gift cards — daily economic value that keeps your community engaged.',
  },
  {
    icon: Sparkles,
    titleHe: 'הייחודיות', titleEn: 'The Uniqueness',
    descHe: 'אנחנו מנהלים הכל — ספקים, מימוש, תמיכה ואנליטיקות. אתם מקבלים פלטפורמה ממותגת מוכנה בלי להשקיע משאב אחד.',
    descEn: 'We handle everything — providers, redemption, support, and analytics. You get a branded platform ready to go without investing a single resource.',
  },
];

export default function BenefitsPage() {
  const { language, direction } = useLanguage();
  const he = language === 'he';
  const isRtl = direction === 'rtl';
  const signupLink = he ? '/he/signup' : '/signup';

  useScrollReveal();

  // ─── Gallery scroll state ─────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const cardWidth = el.firstElementChild?.clientWidth ?? 380;
    const gap = 24; // gap-6
    const index = Math.round(Math.abs(el.scrollLeft) / (cardWidth + gap));
    setActiveIndex(Math.min(index, STORY_CARDS.length - 1));
  };

  const scrollToIndex = (i: number) => {
    if (!scrollRef.current) return;
    const cardWidth = scrollRef.current.firstElementChild?.clientWidth ?? 380;
    const gap = 24;
    const target = i * (cardWidth + gap);
    scrollRef.current.scrollTo({
      left: isRtl ? -target : target,
      behavior: 'smooth',
    });
  };

  return (
    <div dir={direction} className="min-h-screen bg-white overflow-x-hidden">
      <Navbar variant="dark" />

      {/* hide scrollbar globally for gallery */}
      <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>

      {/* ═══════════════════════ S1: HERO — Dual Animation ═══════════════════════ */}
      <div className="relative">
        <section className="relative pt-32 pb-20 bg-slate-50 overflow-hidden">
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
              {/* Text column */}
              <div className={isRtl ? 'text-right' : 'text-left'}>
                <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                  {he
                    ? 'בנו מועדון הטבות בהתאמה מלאה לצרכים שלכם'
                    : 'Build a Benefits Club Fully Customized to Your Needs'}
                </h1>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-lg">
                  {he
                    ? 'פלטפורמה בהתאמה אישית למותג, מאות הנחות, קאשבק וגיפט קארדס'
                    : 'A platform customized to your brand, hundreds of discounts, cashback and gift cards'}
                </p>
                <div className={`flex flex-wrap gap-4 ${isRtl ? '' : 'flex-row-reverse'}`}>
                  <Link
                    to={signupLink}
                    className="inline-block bg-stripe-purple text-white font-semibold px-8 py-3 rounded-xl hover:bg-violet-500 transition-colors"
                  >
                    {he ? 'צרו קשר עם מכירות' : 'Contact Sales'}
                  </Link>
                </div>
              </div>

              {/* Dual animation column */}
              <div className="relative flex justify-center lg:justify-end" style={{ minHeight: 560 }}>
                {/* Primary: WalletCards (front) */}
                <div className="relative z-10">
                  <StoryWalletCards />
                </div>
                {/* Secondary: InsightsCarousel (behind, offset, scaled, PROMINENT) */}
                <div
                  className="hidden md:block absolute z-0"
                  style={{
                    [isRtl ? 'right' : 'left']: '-60px',
                    top: '40px',
                    transform: 'scale(0.82)',
                    transformOrigin: 'top center',
                    opacity: 1,
                  }}
                >
                  <StoryInsightsCarousel />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Gradient diagonal — visible parallelogram strip (PaymentsPage pattern) ── */}
        <div className="relative z-10 h-80 -mt-16">
          <AnimatedGradient clipPath="polygon(0 0, 100% 25%, 100% 100%, 0 75%)" />
          {/* Tube/cylinder highlight overlay — same clip to create 3D pipe illusion */}
          <div className="absolute inset-0 pointer-events-none" style={{
            clipPath: 'polygon(0 0, 100% 25%, 100% 100%, 0 75%)',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(0,0,0,0.18) 100%)',
          }} />
        </div>
      </div>

      {/* ═══════════════════════ S2: WHY A BENEFITS CLUB (diagonal) ═══════════════════════ */}
      <section
        id="why-benefits"
        className="scroll-reveal relative py-20 md:py-32 overflow-hidden"
      >
        {/* Diagonal background */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: isRtl
              ? 'polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 100px))'
              : 'polygon(0 0, 100% 0, 100% calc(100% - 100px), 0 100%)',
            background: 'linear-gradient(135deg, #0A2540 0%, #1a1f5e 60%, #0A2540 100%)',
          }}
        />

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none" style={{ background: 'rgba(99,91,255,0.08)', filter: 'blur(80px)' }} />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <span className="inline-block bg-white/10 text-violet-300 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              {he ? 'למה מועדון הטבות?' : 'Why a Benefits Club?'}
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              {he ? 'למה הארגון שלכם צריך מועדון הטבות' : 'Why Your Organization Needs a Benefits Club'}
            </h2>
            <p className="text-white/60 max-w-xl mx-auto text-base">
              {he
                ? 'הטבות זה לא בונוס — זה תשתית ליצירת קהילה חזקה ונאמנה.'
                : "Benefits aren't a bonus — they're the infrastructure for building a strong, loyal community."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {WHY_REASONS.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.titleEn} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: 'rgba(99,91,255,0.15)' }}
                  >
                    <Icon size={24} className="text-violet-400" />
                  </div>
                  <h3 className={`text-xl font-bold text-white mb-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {he ? r.titleHe : r.titleEn}
                  </h3>
                  <p className={`text-white/60 text-sm leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
                    {he ? r.descHe : r.descEn}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <Link
              to={signupLink}
              className="inline-block bg-stripe-purple text-white font-semibold px-8 py-3 rounded-xl hover:bg-violet-500 transition-colors"
            >
              {he ? 'בואו נדבר' : "Let's Talk"}
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S3: STORIES GALLERY ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="inline-block bg-stripe-purple/10 text-stripe-purple text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              {he ? 'הקהילה שלכם' : 'Your Community'}
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              {he ? 'מה תתנו לקהילה שלכם?' : 'What Will You Give Your Community?'}
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
              {he
                ? 'ארבע דרכים ליצור ערך אמיתי לחברי הארגון — הטבות, קאשבק, גיפט קארדס ומפת הטבות חכמה.'
                : 'Four ways to create real value for your members — benefits, cashback, gift cards and a smart deals map.'}
            </p>
          </div>

          {/* Gallery container with arrows */}
          <div className="relative">
            {/* Left arrow */}
            <button
              onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
              className={`hidden md:flex absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white border border-slate-200 shadow-lg items-center justify-center hover:bg-slate-50 transition-colors ${isRtl ? '-right-4 lg:-right-6' : '-left-4 lg:-left-6'}`}
              aria-label="Previous"
            >
              {isRtl ? <ChevronRight size={20} className="text-slate-600" /> : <ChevronLeft size={20} className="text-slate-600" />}
            </button>

            {/* Right arrow */}
            <button
              onClick={() => scrollToIndex(Math.min(STORY_CARDS.length - 1, activeIndex + 1))}
              className={`hidden md:flex absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white border border-slate-200 shadow-lg items-center justify-center hover:bg-slate-50 transition-colors ${isRtl ? '-left-4 lg:-left-6' : '-right-4 lg:-right-6'}`}
              aria-label="Next"
            >
              {isRtl ? <ChevronLeft size={20} className="text-slate-600" /> : <ChevronRight size={20} className="text-slate-600" />}
            </button>

            {/* Scroll track */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4 px-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {STORY_CARDS.map((card) => (
                <div
                  key={card.id}
                  className="flex-shrink-0 w-[320px] sm:w-[380px] snap-center rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Card header — single purple title only */}
                  <div className={`px-5 pt-5 pb-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                    <h3 className="text-lg font-bold" style={{ color: '#635BFF' }}>
                      {he ? card.titleHe : card.titleEn}
                    </h3>
                  </div>

                  {/* Animation container */}
                  <div className="relative overflow-hidden" style={{ height: 480 }}>
                    <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                      <card.Component />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-2.5 mt-6">
            {STORY_CARDS.map((card, i) => (
              <button
                key={card.id}
                onClick={() => scrollToIndex(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  i === activeIndex
                    ? 'bg-stripe-purple w-7'
                    : 'bg-slate-300 hover:bg-slate-400'
                }`}
                aria-label={`Go to story ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S4: PROVIDERS (Home Page Partner Layout) ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-slate-50 overflow-hidden">
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

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center mb-14">
            <span className="inline-block bg-stripe-purple/10 text-stripe-purple text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              {he ? 'כוח מיקוח' : 'Bargaining Power'}
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              {he ? 'מאות ספקי הטבות ארציים' : 'Hundreds of National Benefit Providers'}
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
              {he
                ? 'העבודה עם עשרות ארגונים במקביל יוצרת כוח מיקוח שמתורגם להסכמים מסחריים חזקים — ולהנחות שלא תמצאו במקום אחר.'
                : 'Working with dozens of organizations simultaneously creates bargaining power that translates to strong commercial agreements — and discounts you won\'t find elsewhere.'}
            </p>
          </div>

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
            <div className={`${isRtl ? 'partner-slider' : 'partner-slider-reverse'} flex items-center gap-12 w-max`}>
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

      {/* ═══════════════════════ S5: PLATFORM FEATURES ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-white overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="inline-block bg-stripe-purple/10 text-stripe-purple text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              {he ? 'הפלטפורמה' : 'The Platform'}
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              {he ? 'הכל בשליטתכם' : 'Everything Under Your Control'}
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
              {he
                ? 'ממשק ניהול אחד שנותן לכם שליטה מלאה על מועדון ההטבות — מהתאמה אישית ועד ניתוח נתונים.'
                : 'One admin interface that gives you full control over the benefits club — from customization to analytics.'}
            </p>
          </div>
          <BenefitsFeatureGrid />
        </div>
      </section>

      {/* ═══════════════════════ S6: HOW IT WORKS (dark) ═══════════════════════ */}
      <section
        id="how-it-works"
        className="scroll-reveal relative py-20 md:py-32 overflow-x-hidden"
        style={{ background: 'linear-gradient(135deg, #0A2540 0%, #1a1f5e 60%, #0A2540 100%)' }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none" style={{ background: 'rgba(99,91,255,0.08)', filter: 'blur(80px)' }} />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <span className="inline-block bg-white/10 text-violet-300 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              {he ? 'תהליך' : 'Process'}
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              {he ? 'איך זה עובד?' : 'How Does It Work?'}
            </h2>
            <p className="text-white/60 max-w-xl mx-auto text-base">
              {he
                ? 'שלושה צעדים פשוטים להקמת מועדון הטבות ממותג לארגון שלכם.'
                : 'Three simple steps to launch a branded benefits club for your organization.'}
            </p>
          </div>
          <BenefitsHowItWorks />
        </div>
      </section>

      {/* ═══════════════════════ S7: STATS ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-28 bg-stripe-light overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              {he ? 'מספרים שמדברים' : 'Numbers That Speak'}
            </h2>
          </div>
          <BenefitsStats />
        </div>
      </section>

      {/* ═══════════════════════ S8: FINAL CTA ═══════════════════════ */}
      <section
        className="scroll-reveal relative py-20 md:py-32 overflow-x-hidden"
        style={{ background: 'linear-gradient(135deg, #0A2540 0%, #2d1b69 50%, #0A2540 100%)' }}
      >
        <div className="absolute top-10 right-10 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'rgba(99,91,255,0.06)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-10 left-10 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'rgba(0,212,255,0.05)', filter: 'blur(50px)' }} />

        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl lg:text-5xl font-bold text-white mb-6">
            {he
              ? 'מוכנים לבנות מועדון הטבות לארגון שלכם?'
              : 'Ready to Build a Benefits Club for Your Organization?'}
          </h2>
          <p className="text-white/70 text-lg mb-10 max-w-xl mx-auto">
            {he
              ? 'הצטרפו לעשרות ארגונים שכבר משתמשים בפלטפורמה שלנו כדי ליצור ערך אמיתי לקהילה שלהם.'
              : 'Join dozens of organizations already using our platform to create real value for their communities.'}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              to={signupLink}
              className="inline-block bg-stripe-purple text-white font-semibold px-8 py-3 rounded-xl hover:bg-violet-500 transition-colors"
            >
              {he ? 'התחילו עכשיו' : 'Get Started'}
            </Link>
            <Link
              to={he ? '/he/partners' : '/partners'}
              className="inline-block border border-white/30 bg-white/10 text-white font-semibold px-10 py-3 rounded-xl hover:bg-white/20 transition-colors"
            >
              {he ? 'הכירו את השותפים שלנו' : 'Meet Our Partners'}
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FOOTER ═══════════════════════ */}
      <Suspense fallback={<div className="h-64 bg-stripe-blue" />}>
        <Footer />
      </Suspense>
    </div>
  );
}
