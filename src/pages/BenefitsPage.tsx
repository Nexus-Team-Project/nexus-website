import { useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import Navbar from '../components/Navbar';
import AnimatedGradient from '../components/AnimatedGradient';
import BenefitsProviderGrid from '../components/benefits/BenefitsProviderGrid';
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

// ─── Reusable bullet ──────────────────────────────────────
function Bullet({ text, icon: Icon = Check }: { text: string; icon?: React.ElementType }) {
  const { direction } = useLanguage();
  const isRtl = direction === 'rtl';
  return (
    <li className={`flex items-start gap-3 ${isRtl ? '' : 'flex-row-reverse'}`}>
      <span className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-stripe-purple/10 flex items-center justify-center">
        <Icon size={12} className="text-stripe-purple" />
      </span>
      <span className="text-slate-600">{text}</span>
    </li>
  );
}

export default function BenefitsPage() {
  const { language, direction } = useLanguage();
  const he = language === 'he';
  const isRtl = direction === 'rtl';
  const signupLink = he ? '/he/signup' : '/signup';

  useScrollReveal();

  return (
    <div dir={direction} className="min-h-screen bg-white overflow-x-hidden">
      <Navbar variant="dark" />

      {/* ═══════════════════════ S1: HERO — Wallet Cards Story ═══════════════════════ */}
      <section className="relative pt-32 pb-12 md:pt-40 md:pb-20 bg-slate-50 overflow-hidden">
        <AnimatedGradient />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Text column */}
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4">
                {he ? 'מועדון הטבות ארגוני' : 'Corporate Benefits Club'}
              </p>
              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                {he
                  ? 'נרכז לך את כל ההטבות במקום אחד'
                  : 'All Your Benefits In One Place'}
              </h1>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-lg">
                {he
                  ? 'הנכס הארגוני החשוב ביותר הוא הקהילה. מועדון הטבות חכם יוצר חיבור שמחזיק לאורך זמן — דרך ערך כלכלי צרכני שפותר את הכאב היומיומי של חברי הקהילה.'
                  : 'Your organization\'s greatest asset is its community. A smart benefits club creates lasting connection — through consumer savings that solve your members\' everyday financial pain.'}
              </p>
              <ul className={`space-y-3 mb-8 ${isRtl ? 'text-right' : 'text-left'}`}>
                <Bullet text={he ? 'מאות ספקים ארציים עם הסכמים מסחריים' : 'Hundreds of national providers with negotiated deals'} />
                <Bullet text={he ? 'התאמה מלאה למיתוג הארגון' : 'Fully branded to your organization'} />
                <Bullet text={he ? 'ניהול, תמיכה ואנליטיקות מובנים' : 'Built-in management, support & analytics'} />
              </ul>
              <div className={`flex flex-wrap gap-4 ${isRtl ? '' : 'flex-row-reverse'}`}>
                <Link
                  to={signupLink}
                  className="inline-flex items-center gap-2 bg-stripe-purple text-white px-7 py-3.5 rounded-full font-semibold text-sm hover:bg-[#5649d8] transition-all shadow-lg shadow-stripe-purple/25 hover:shadow-xl hover:shadow-stripe-purple/30"
                >
                  {he ? 'התחילו עכשיו' : 'Get Started'}
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 bg-white text-slate-700 px-7 py-3.5 rounded-full font-semibold text-sm border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  {he ? 'איך זה עובד?' : 'How It Works'}
                </a>
              </div>
            </div>

            {/* Story animation — Wallet Cards (phone mockup) */}
            <div className="flex justify-center lg:justify-end">
              <StoryWalletCards />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S2: CASHBACK — Insights Story ═══════════════════════ */}
      <section className="scroll-reveal relative py-16 md:py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Story animation — Insights Carousel */}
            <div className={`flex justify-center ${isRtl ? 'lg:order-2' : 'lg:order-1'}`}>
              <StoryInsightsCarousel />
            </div>

            {/* Text */}
            <div className={`${isRtl ? 'lg:order-1 text-right' : 'lg:order-2 text-left'}`}>
              <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4">
                {he ? 'קאשבק חכם' : 'Smart Cashback'}
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-6">
                {he ? 'עד 60% קאשבק על הוצאות יומיומיות' : 'Up to 60% Cashback on Daily Expenses'}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                {he
                  ? 'כל רכישה דרך הפלטפורמה מחזירה כסף אמיתי. הקאשבק נצבר אוטומטית ואפשר להשתמש בו בכל רגע — בלי הגבלה, בלי תנאים מסובכים.'
                  : 'Every purchase through the platform returns real money. Cashback accumulates automatically and can be used anytime — no limits, no complicated terms.'}
              </p>
              <ul className={`space-y-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                <Bullet text={he ? 'קאשבק אוטומטי על כל רכישה' : 'Automatic cashback on every purchase'} />
                <Bullet text={he ? 'צבירה ללא הגבלה' : 'Unlimited accumulation'} />
                <Bullet text={he ? 'מימוש מיידי בכל עת' : 'Instant redemption anytime'} />
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S3: GIFT CARDS — Gift Cards Story ═══════════════════════ */}
      <section className="scroll-reveal relative py-16 md:py-24 bg-slate-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Text */}
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4">
                {he ? 'גיפט קארדס' : 'Gift Cards'}
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-6">
                {he
                  ? 'גיפט קארד מהמותגים האהובים עליך'
                  : 'Gift Cards From Your Favorite Brands'}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                {he
                  ? 'משלו את הקאשבק שצברתם בגיפט קארדס ממותגים בינלאומיים ומקומיים. Airbnb, Nike, Garmin ועוד עשרות מותגים נוספים — הכל במרחק נגיעה.'
                  : 'Redeem your cashback with gift cards from international and local brands. Airbnb, Nike, Garmin and dozens more — all at your fingertips.'}
              </p>
              <ul className={`space-y-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                <Bullet text={he ? 'מגוון מותגים בינלאומיים ומקומיים' : 'International and local brand variety'} />
                <Bullet text={he ? 'מימוש קאשבק מיידי' : 'Instant cashback redemption'} />
                <Bullet text={he ? 'שליחת מתנה לחברים ולמשפחה' : 'Send gifts to friends and family'} />
              </ul>
            </div>

            {/* Story animation — Gift Cards 3D Carousel */}
            <div className="flex justify-center">
              <StoryGiftCards />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S4: NEARBY — Map Story ═══════════════════════ */}
      <section className="scroll-reveal relative py-16 md:py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Story animation — Nearby Map */}
            <div className={`flex justify-center ${isRtl ? 'lg:order-2' : 'lg:order-1'}`}>
              <StoryNearbyMap />
            </div>

            {/* Text */}
            <div className={`${isRtl ? 'lg:order-1 text-right' : 'lg:order-2 text-left'}`}>
              <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4">
                {he ? 'הטבות מסביבך' : 'Nearby Benefits'}
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-6">
                {he
                  ? 'נציג לך איפה ההטבות הכי שוות'
                  : "We'll Show You Where the Best Deals Are"}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                {he
                  ? 'מפה חכמה שמראה לך בזמן אמת את ההטבות הקרובות אליך. בכל מקום שתהיו — תמיד תדעו איפה יש הנחות, קאשבק והצעות מיוחדות.'
                  : 'A smart map that shows you real-time deals near you. Wherever you are — you\'ll always know where to find discounts, cashback and special offers.'}
              </p>
              <ul className={`space-y-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                <Bullet text={he ? 'מפה אינטראקטיבית בזמן אמת' : 'Real-time interactive map'} />
                <Bullet text={he ? 'הטבות ממוקמות על המסלול שלך' : 'Benefits located along your route'} />
                <Bullet text={he ? 'התראות על הנחות בסביבה' : 'Alerts for nearby discounts'} />
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S5: PROVIDERS ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-slate-50 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
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
          <BenefitsProviderGrid />
        </div>
      </section>

      {/* ═══════════════════════ S6: PLATFORM FEATURES ═══════════════════════ */}
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

      {/* ═══════════════════════ S7: HOW IT WORKS (dark) ═══════════════════════ */}
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

      {/* ═══════════════════════ S8: STATS ═══════════════════════ */}
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

      {/* ═══════════════════════ S9: FINAL CTA ═══════════════════════ */}
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
              className="inline-flex items-center gap-2 bg-stripe-purple text-white px-8 py-4 rounded-full font-semibold text-base hover:bg-[#5649d8] transition-all shadow-lg shadow-stripe-purple/30 hover:shadow-xl hover:shadow-stripe-purple/40"
            >
              {he ? 'התחילו עכשיו' : 'Get Started'}
            </Link>
            <Link
              to={he ? '/he/partners' : '/partners'}
              className="inline-flex items-center gap-2 bg-white/10 text-white px-8 py-4 rounded-full font-semibold text-base border border-white/20 hover:bg-white/20 transition-all"
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
