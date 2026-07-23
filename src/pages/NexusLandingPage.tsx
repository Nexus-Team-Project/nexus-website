import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BorderHighlightCard from '../components/BorderHighlightCard';
import { useLanguage } from '../i18n/LanguageContext';
import StoryGiftCards from '../components/benefits/StoryGiftCards';
import HeroGiftFlow from '../components/benefits/HeroGiftFlow';
import { GIFT_FLOW_STEPS, STEP_WIDTH, STEP_HEIGHT } from '../components/dashboard-steps';
import StoryInsightsCarousel from '../components/benefits/StoryInsightsCarousel';
import PartnerBubbles from '../components/PartnerBubbles';
import GoogleSignIn from '../components/GoogleSignIn';
import { useSEO } from '../hooks/useSEO';

const Navbar = lazy(() => import('../components/Navbar'));
const Footer = lazy(() => import('../components/Footer'));

// ─── Intersection Observer Hook ──────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

// ─── Section Wrapper ─────────────────────────────────────────────────────────
function FadeInSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, isVisible } = useInView();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Deck design language: gradient text + navy mesh background ──────────────
const gradientText: React.CSSProperties = {
  background: 'linear-gradient(90deg,#0EA5E9,#00D4FF)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

/** Clipped gradient text with custom stops — used for the deck's colored numbers. */
const gradText = (from: string, to: string): React.CSSProperties => ({
  background: `linear-gradient(90deg,${from},${to})`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
});

/** The deck's colored glow mesh over a navy base. Static (no animation) to avoid mobile repaint shake, matching the deck. */
function DeckMesh({ overlay = 'left' }: { overlay?: 'left' | 'right' }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute w-[150%] h-[150%] -top-1/4 -left-1/4 opacity-60">
        <div className="absolute rounded-full" style={{ width: '55%', height: '65%', opacity: 0.9, background: 'radial-gradient(circle,#0D9488 0%,#0B7F74 40%,transparent 65%)', top: '0%', left: '50%' }} />
        <div className="absolute rounded-full" style={{ width: '60%', height: '60%', opacity: 0.9, background: 'radial-gradient(circle,#0EA5E9 0%,#0284C7 40%,transparent 65%)', top: '20%', left: '20%' }} />
        <div className="absolute rounded-full" style={{ width: '45%', height: '45%', opacity: 0.8, background: 'radial-gradient(circle,#FB923C 0%,#F97316 35%,transparent 65%)', top: '12%', left: '-5%' }} />
        <div className="absolute rounded-full" style={{ width: '55%', height: '55%', opacity: 0.85, background: 'radial-gradient(circle,#34D399 0%,#10B981 40%,transparent 65%)', top: '30%', left: '40%' }} />
        <div className="absolute rounded-full" style={{ width: '50%', height: '55%', opacity: 0.85, background: 'radial-gradient(circle,#14B8A6 0%,#0D9488 40%,transparent 65%)', top: '5%', left: '30%' }} />
      </div>
      <div className="absolute inset-0" style={{ background: overlay === 'left' ? 'linear-gradient(to left, rgba(10,37,64,0.55), rgba(7,26,48,0.9))' : 'linear-gradient(to right, rgba(10,37,64,0.55), rgba(7,26,48,0.9))' }} />
    </div>
  );
}

// ─── Slide 1: Hero — "a welfare wallet that lives all year" ──────────────────
function HeroSection() {
  const { language } = useLanguage();
  const he = language === 'he';
  const BackArrow = he ? ArrowLeft : ArrowRight;

  return (
    <section className="relative min-h-[90vh] md:min-h-screen flex items-center overflow-hidden bg-[#F6F9FC]">
      {/* Diagonal navy background with the deck mesh — matches the legacy hero's slanted edge */}
      <div
        className="absolute inset-0 [clip-path:none] lg:[clip-path:polygon(0_0,100%_0,100%_100%,0_65%)]"
        style={{ background: 'radial-gradient(120% 120% at 85% 15%,#0E2F50 0%,#0A2540 55%,#071a30 100%)' }}
      >
        <DeckMesh overlay="left" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-32 pb-0 lg:pb-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className={`text-center ${he ? 'lg:text-right' : 'lg:text-left'}`}
          >
            <div className="text-sm font-semibold tracking-[0.22em] uppercase mb-6" style={{ color: '#38BDF8' }}>
              {he ? 'הצעת הערך' : 'The Value Proposition'}
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.12] tracking-tight mb-6">
              {he ? (
                <>
                  ארנק הרווחה הדיגיטלי
                  <br />
                  <span style={gradientText}>שחי כל השנה</span>
                  <br />
                  לא רק בחג.
                </>
              ) : (
                <>
                  The digital welfare wallet
                  <br />
                  <span style={gradientText}>that lives all year</span>
                  <br />
                  not just for the holiday.
                </>
              )}
            </h1>

            <p className="text-lg md:text-xl text-white/90 leading-relaxed max-w-xl mb-10">
              {he
                ? 'העובד מקבל מתנה, וגם צובר קאשבק על כל תשלום. הארגון מקבל שקיפות, שליטה, והחזר על כל תקציב שלא נוצל.'
                : 'Employees get a gift and earn cashback on every payment. The organization gets transparency, control, and a refund on any unused budget.'}
            </p>

            <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
              <a
                href="#cta-final"
                className="group inline-flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/85 text-white font-semibold px-8 py-4 rounded-lg transition-all duration-300 hover:shadow-xl hover:shadow-nx-primary/30 text-base"
              >
                {he ? 'התחל עכשיו' : 'Get Started'}
                <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                  <BackArrow size={16} className="inline" />
                </span>
              </a>
              <GoogleSignIn variant="hero" redirectTo="/dashboard" />
            </div>
          </motion.div>

          {/* Live gift-redemption flow inside a phone (auto-looping) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
            className="flex justify-center -mb-16 lg:mb-0"
          >
            {/* Mobile: the phone bleeds down and is clipped flush at the hero's bottom edge. */}
            <HeroGiftFlow />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── Slide 2: Differentiation — a holiday voucher vs a living wallet ─────────
function VoucherVsWalletSection() {
  const { language } = useLanguage();
  const he = language === 'he';

  const voucherPoints = he
    ? ['רגע חד-פעמי, נגמר בקופה.', 'הקשר נגמר עד החג הבא.', 'אין לעובד סיבה לחזור.']
    : ['A one-time moment, gone at checkout.', 'The connection ends until the next holiday.', 'No reason for the employee to return.'];

  const walletPoints = he
    ? ['קאשבק נצבר על כל תשלום.', 'הערך נשאר בארנק לשימוש הבא.', 'העובד חוזר, משתמש, ומחובר.']
    : ['Cashback accrues on every payment.', 'The value stays in the wallet for next time.', 'The employee returns, uses it, and stays connected.'];

  return (
    <section className="py-32 bg-[#F6F9FC]">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="mb-16">
            <span className="text-nx-primary font-bold text-sm tracking-[0.2em] uppercase mb-4 block">
              {he ? 'הבידול' : 'The Differentiation'}
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight">
              {he ? 'שובר לחג מול ארנק חי' : 'A holiday voucher vs a living wallet'}
            </h2>
          </div>
        </FadeInSection>

        <div className="grid md:grid-cols-2 gap-8 items-stretch">
          {/* Competitor card — dim (below the wallet on mobile) */}
          <FadeInSection className="order-2 md:order-none">
            <div className="h-full bg-white border border-slate-200 rounded-[18px] p-10 md:p-12">
              <div className="text-sm font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">
                {he ? 'מה שכולם עושים' : 'What everyone does'}
              </div>
              <div className="text-4xl md:text-5xl font-bold text-slate-500 mb-8">
                {he ? 'שובר לחג' : 'A holiday voucher'}
              </div>
              <ul className="space-y-5">
                {voucherPoints.map((p, i) => (
                  <li key={i} className="flex items-start gap-3 text-lg md:text-xl text-slate-500 leading-relaxed">
                    <span className="mt-2.5 w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeInSection>

          {/* Nexus card — dark, glowing (on top on mobile) */}
          <FadeInSection className="order-1 md:order-none">
            <div
              className="relative h-full min-h-[560px] overflow-hidden rounded-[18px] p-10 md:p-12 text-white"
              style={{ background: 'radial-gradient(120% 120% at 80% 10%,#0E2F50,#0A2540 70%)', boxShadow: '0 24px 60px rgba(10,37,64,0.28)' }}
            >
              <div className="relative z-10">
                <div className="text-sm font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: '#38BDF8' }}>
                  {he ? 'מה שנקסוס עושה' : 'What Nexus does'}
                </div>
                <div className="text-4xl md:text-5xl font-bold mb-8">
                  {he ? 'ארנק חי כל השנה' : 'A wallet alive all year'}
                </div>
                <ul className="space-y-5">
                  {walletPoints.map((p, i) => (
                    <li key={i} className="flex items-start gap-3 text-lg md:text-xl text-white/90 leading-relaxed">
                      <CheckCircle size={20} className="mt-1 shrink-0" style={{ color: '#38BDF8' }} />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Gift cards animating + bleeding from the bottom (deck: GiftCardCarousel) */}
              <div className="pointer-events-none absolute inset-x-0 top-1/2 story-no-text">
                <StoryGiftCards />
              </div>
            </div>
          </FadeInSection>
        </div>
      </div>

      {/* Hide StoryGiftCards' own heading — this section has its own. */}
      <style>{`.story-no-text > div > div:first-child{display:none!important}`}</style>
    </section>
  );
}

// ─── Slide 3: The star — the cashback engine ("expenses become income") ──────
function CashbackEngineSection() {
  const { language } = useLanguage();
  const he = language === 'he';
  const BackArrow = he ? ArrowLeft : ArrowRight;

  const steps = he
    ? [
        { n: '01', from: '#0EA5E9', to: '#00D4FF', title: 'גם מתנה וגם צבירה', desc: 'אותו תקציב - ערך כפול לעובד, בלי עלות נוספת לארגון.' },
        { n: '02', from: '#0D9488', to: '#34D399', title: 'העובד חוזר', desc: 'קאשבק שיושב בארנק = סיבה לפתוח את האפליקציה ולהשתמש שוב.' },
        { n: '03', from: '#FB923C', to: '#0EA5E9', title: 'ROI אמיתי', desc: 'מעורבות רציפה לאורך כל השנה - לא "נתנו מתנה" חד-פעמית.' },
      ]
    : [
        { n: '01', from: '#0EA5E9', to: '#00D4FF', title: 'Both a gift and accumulation', desc: 'The same budget - double the value for the employee, at no extra cost to the organization.' },
        { n: '02', from: '#0D9488', to: '#34D399', title: 'The employee returns', desc: 'Cashback sitting in the wallet is a reason to open the app and use it again.' },
        { n: '03', from: '#FB923C', to: '#0EA5E9', title: 'Real ROI', desc: 'Continuous engagement all year - not a one-time "we gave a gift".' },
      ];

  return (
    <section id="features" className="py-32 bg-[#F6F9FC]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text */}
          <FadeInSection>
            <div className={he ? 'text-right' : 'text-left'}>
              <span className="text-nx-primary font-bold text-sm tracking-[0.2em] uppercase mb-4 block">
                {he ? 'הכוכב · מנוע הקאשבק' : 'The Star · Cashback Engine'}
              </span>
              <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight mb-4">
                {he ? 'ההוצאות הופכות להכנסות' : 'Expenses become income'}
              </h2>
              <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-8">
                {he ? (
                  <>אותו תקציב מתנה עובד פעמיים - <strong className="text-slate-900 font-semibold">כמתנה, וגם כמנוע צבירה.</strong></>
                ) : (
                  <>The same gift budget works twice - <strong className="text-slate-900 font-semibold">as a gift, and as an accumulation engine.</strong></>
                )}
              </p>

              <div className="inline-flex items-baseline gap-3 bg-white border border-slate-200 rounded-2xl px-6 py-4 mb-8">
                <span className="text-4xl md:text-5xl font-bold" style={{ ...gradText('#0D9488', '#34D399'), direction: 'ltr' }}>{he ? 'עד 60%' : 'Up to 60%'}</span>
                <span className="text-base md:text-lg text-slate-500">{he ? 'קאשבק על קטגוריות נבחרות' : 'cashback on select categories'}</span>
              </div>

              <div className="space-y-6 mb-8">
                {steps.map((s) => (
                  <div key={s.n} className="flex items-start gap-4">
                    <div className="text-4xl font-bold leading-none shrink-0 w-14" style={{ ...gradText(s.from, s.to), direction: 'ltr' }}>{s.n}</div>
                    <div>
                      <div className="text-xl md:text-2xl font-semibold text-slate-900 mb-1">{s.title}</div>
                      <div className="text-base md:text-lg text-slate-500 leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-4 mt-8">
                <a
                  href="#cta-final"
                  className="group inline-flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/85 text-white font-semibold px-8 py-4 rounded-lg transition-all duration-300 hover:shadow-xl hover:shadow-nx-primary/30 text-base"
                >
                  {he ? 'התחל עכשיו' : 'Get Started'}
                  <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                    <BackArrow size={16} className="inline" />
                  </span>
                </a>
                <a
                  href="#cta-final"
                  className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-semibold px-8 py-4 rounded-lg transition-all text-base"
                >
                  {he ? 'צור קשר עם המכירות' : 'Contact Sales'}
                </a>
              </div>
            </div>
          </FadeInSection>

          {/* Insights carousel (deck: InsightsCarousel) */}
          <FadeInSection>
            <div className="story-no-text relative flex justify-center">
              <StoryInsightsCarousel />
            </div>
          </FadeInSection>
        </div>
      </div>

      <style>{`.story-no-text > div > div:first-child{display:none!important}`}</style>
    </section>
  );
}

// ─── Slide 4: Accumulation potential — the ₪11,472 number + category table ───
function AccumulationSection() {
  const { language } = useLanguage();
  const he = language === 'he';

  const rows = he
    ? [
        { area: 'אופנה והנעלה', pct: '20%', yr: '1,680 ₪' },
        { area: 'מוצרים לבית', pct: 'עד 50%', yr: '4,800 ₪' },
        { area: 'חשמל ואלקטרוניקה', pct: '15%', yr: '540 ₪' },
        { area: 'פנאי ובילוי', pct: '15%', yr: '1,440 ₪' },
        { area: 'קמעונאות (סופר)', pct: '4.5%', yr: '2,052 ₪' },
        { area: 'ביטוח בריאות פרטי', pct: '20%', yr: '960 ₪' },
      ]
    : [
        { area: 'Fashion & footwear', pct: '20%', yr: '₪1,680' },
        { area: 'Home products', pct: 'Up to 50%', yr: '₪4,800' },
        { area: 'Electronics', pct: '15%', yr: '₪540' },
        { area: 'Leisure & entertainment', pct: '15%', yr: '₪1,440' },
        { area: 'Retail (supermarket)', pct: '4.5%', yr: '₪2,052' },
        { area: 'Private health insurance', pct: '20%', yr: '₪960' },
      ];

  return (
    <section className="relative overflow-hidden bg-[#F1F5F9]">
      {/* Dark band with a diagonal top AND bottom edge (parallelogram ribbon) */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(120% 120% at 15% 20%,#0E2F50,#0A2540 60%,#071a30)',
          clipPath: 'polygon(0 0, 100% 7%, 100% 100%, 0 93%)',
        }}
      >
        <div
          className="absolute rounded-full"
          style={{ top: -160, insetInlineEnd: -120, width: 560, height: 560, background: 'radial-gradient(circle,rgba(14,165,233,0.4),transparent 65%)', filter: 'blur(50px)' }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-36 md:pt-44 pb-20 md:pb-24">
        <div className="grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          {/* The headline number */}
          <FadeInSection className="lg:col-span-2">
            <div className={he ? 'text-right' : 'text-left'}>
              <div className="text-sm font-semibold tracking-[0.2em] uppercase mb-5" style={{ color: '#38BDF8' }}>
                {he ? 'פוטנציאל הצבירה' : 'Accumulation Potential'}
              </div>
              <div className={he ? 'text-right' : 'text-left'}>
                <span className="text-6xl md:text-8xl font-bold leading-none tracking-tight" style={{ ...gradientText, direction: 'ltr' }}>₪11,472</span>
                <span className="text-2xl md:text-3xl font-bold align-top" style={{ color: '#38BDF8' }}>*</span>
              </div>
              <div className="text-xl md:text-2xl font-medium text-white mt-5">
                {he ? 'צבירה שנתית לארנק העובד' : 'Annual accumulation in the employee wallet'}
              </div>
              <div className="text-base md:text-lg text-white/60 mt-2">
                {he ? '≈ 956 ₪ בחודש · בניצול מלא' : '≈ ₪956 per month · at full utilization'}
              </div>
            </div>
          </FadeInSection>

          {/* Category table */}
          <FadeInSection className="lg:col-span-3">
            <div className="rounded-[18px] px-6 md:px-8 py-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-white/55 text-xs md:text-sm font-semibold uppercase tracking-wider">
                    <th className={`py-4 font-semibold ${he ? 'text-right' : 'text-left'}`}>{he ? 'תחום' : 'Category'}</th>
                    <th className="py-4 font-semibold text-center">{he ? '% צבירה' : 'Cashback %'}</th>
                    <th className={`py-4 font-semibold ${he ? 'text-left' : 'text-right'}`}>{he ? 'שנתי' : 'Annual'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.area} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                      <td className={`py-4 text-base md:text-lg text-white ${he ? 'text-right' : 'text-left'}`}>{r.area}</td>
                      <td className="py-4 text-base md:text-lg font-semibold text-center" style={{ color: '#38BDF8' }}>{r.pct}</td>
                      <td className={`py-4 text-base md:text-lg font-semibold text-white tabular-nums ${he ? 'text-left' : 'text-right'}`} style={{ direction: 'ltr' }}>{r.yr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FadeInSection>
        </div>

        <FadeInSection>
          <p className="text-sm md:text-base text-white/60 mt-10 max-w-3xl leading-relaxed">
            {he
              ? '* אומדן להמחשה בלבד, המבוסס על נתוני הלמ"ס לצריכה ממוצעת של משק בית בישראל, בהנחה שהעובד מרכז את כלל הוצאותיו בארנק. גם צבירה חלקית מחזירה את עלות הרווחה לארגון כמה וכמה פעמים.'
              : '* An illustrative estimate based on Israel CBS data for average household consumption, assuming the employee channels all of their spending through the wallet. Even partial accumulation returns the welfare budget cost to the organization several times over.'}
          </p>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Slide 5: Partner ecosystem — "built with the strongest partners" ────────
function PartnersSection() {
  const { language } = useLanguage();
  const he = language === 'he';
  const BackArrow = he ? ArrowLeft : ArrowRight;

  return (
    <section className="relative overflow-hidden bg-[#F1F5F9] pt-16 md:pt-24 pb-36">
      {/* Mobile: bubbles run in the background, behind the content */}
      <div className="lg:hidden absolute inset-0 opacity-30 pointer-events-none">
        <PartnerBubbles />
      </div>
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Text (right in RTL) */}
          <FadeInSection>
            <div className={he ? 'text-right' : 'text-left'}>
              <span className="text-nx-primary font-bold text-sm tracking-[0.2em] uppercase mb-4 block">
                {he ? 'אקוסיסטם של שותפים' : 'A Partner Ecosystem'}
              </span>
              <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight mb-5">
                {he ? 'בנוי עם השותפים החזקים ביותר' : 'Built with the strongest partners'}
              </h2>
              <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-8 max-w-xl">
                {he ? (
                  <>מאות מותגים מובילים בקמעונאות, פנאי, קולינריה ואופנה. אנחנו ממנפים כוח צרכני כדי להביא לעובדים את ההצעות <strong className="text-slate-900 font-semibold">הכי שוות.</strong></>
                ) : (
                  <>Hundreds of leading brands in retail, leisure, dining, and fashion. We leverage consumer buying power to bring employees the <strong className="text-slate-900 font-semibold">best offers.</strong></>
                )}
              </p>
              <div className="flex gap-10 md:gap-14">
                <div>
                  <div className="text-4xl md:text-5xl font-bold leading-none" style={{ ...gradientText, direction: 'ltr' }}>160+</div>
                  <div className="text-sm md:text-base text-slate-500 mt-2">{he ? 'מותגים שותפים' : 'Partner brands'}</div>
                </div>
                <div>
                  <div className="text-4xl md:text-5xl font-bold leading-none" style={{ ...gradText('#0D9488', '#34D399') }}>{he ? 'קאשבק' : 'Cashback'}</div>
                  <div className="text-sm md:text-base text-slate-500 mt-2">{he ? 'על כל פדיון' : 'on every redemption'}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-10">
                <a
                  href="#cta-final"
                  className="group inline-flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/85 text-white font-semibold px-8 py-4 rounded-lg transition-all duration-300 hover:shadow-xl hover:shadow-nx-primary/30 text-base"
                >
                  {he ? 'התחל עכשיו' : 'Get Started'}
                  <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                    <BackArrow size={16} className="inline" />
                  </span>
                </a>
                <Link
                  to={he ? '/he/partners' : '/partners'}
                  className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-semibold px-8 py-4 rounded-lg transition-all text-base"
                >
                  {he ? 'למד עוד' : 'Learn More'}
                </Link>
              </div>
            </div>
          </FadeInSection>

          {/* Partner bubbles (left in RTL) - desktop only; on mobile they are the background */}
          <FadeInSection className="hidden lg:block">
            <div className="relative w-full h-[600px]">
              <PartnerBubbles />
            </div>
          </FadeInSection>
        </div>
      </div>
    </section>
  );
}

// ─── Slides 6+7 unified: activation + control, with the live 5-step demo ─────
function ActivationControlSection() {
  const { language } = useLanguage();
  const he = language === 'he';

  const steps = GIFT_FLOW_STEPS;
  const [active, setActive] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.46);

  // Fit the fixed 1200-wide mock screen fluidly into the left column.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / STEP_WIDTH);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-advance: one dashboard screen at a time, a few seconds each.
  useEffect(() => {
    const id = window.setInterval(() => setActive((p) => (p + 1) % steps.length), 5000);
    return () => window.clearInterval(id);
  }, [steps.length]);

  const Active = steps[active].Component;

  return (
    <section className="py-32 bg-[#F6F9FC] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className={`mb-16 ${he ? 'text-right' : 'text-left'}`}>
            <span className="text-nx-primary font-bold text-sm tracking-[0.2em] uppercase mb-4 block">
              {he ? 'הפעלה ושליטה' : 'Activation & Control'}
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight">
              {he ? 'פשוט להפעיל, פשוט לשלוט' : 'Simple to launch, simple to control'}
            </h2>
          </div>
        </FadeInSection>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
          {/* Two cubes (right in RTL) */}
          <div className="flex flex-col gap-6">
            <FadeInSection className="flex-1">
              <div
                className={`h-full rounded-[18px] p-8 md:p-10 text-white ${he ? 'text-right' : 'text-left'}`}
                style={{ background: 'radial-gradient(120% 120% at 80% 10%,#0E2F50,#0A2540 70%)', boxShadow: '0 24px 60px rgba(10,37,64,0.28)' }}
              >
                <div className="text-5xl md:text-6xl font-bold leading-none" style={{ ...gradientText, direction: 'ltr', textAlign: he ? 'right' : 'left' }}>{he ? '60 שניות' : '60 seconds'}</div>
                <div className="text-xl md:text-2xl font-semibold mt-4">{he ? 'הפעלה בקליק' : 'Activation in a click'}</div>
                <p className="text-base md:text-lg text-white/80 leading-relaxed mt-2">
                  {he ? 'מהחלטה ועד מתנה שיוצאת לעובדים - בלי פרויקט, בלי אקסלים.' : 'From decision to a gift going out - no project, no spreadsheets.'}
                </p>
                <div className="flex flex-wrap items-center gap-2.5 mt-5">
                  <span className="text-sm font-medium rounded-full px-3 py-1.5 bg-white/10 border border-white/15">{he ? 'או נציג שלנו יפעיל עבורכם' : 'or our rep activates it for you'}</span>
                </div>
              </div>
            </FadeInSection>

            <FadeInSection className="flex-1">
              <div className={`h-full rounded-[18px] p-8 md:p-10 bg-white border border-slate-200 ${he ? 'text-right' : 'text-left'}`}>
                <div className="text-4xl md:text-5xl font-bold leading-none" style={{ ...gradientText, textAlign: he ? 'right' : 'left' }}>{he ? 'בזמן אמת' : 'Real-time'}</div>
                <div className="text-xl md:text-2xl font-semibold text-slate-900 mt-4">{he ? 'שקיפות ושליטה מלאה' : 'Full transparency and control'}</div>
                <p className="text-base md:text-lg text-slate-500 leading-relaxed mt-2">
                  {he ? 'דוחות חיים על ניצול ומימוש, ושליטה מלאה על איפה ואיך מממשים.' : 'Live reports on utilization and redemption, and full control over where and how it is redeemed.'}
                </p>
              </div>
            </FadeInSection>
          </div>

          {/* Single dashboard screen at a time, auto-advancing (left in RTL) */}
          <div>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
              <div className="h-9 bg-slate-50 border-b border-slate-100 flex items-center px-4 gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-300" />
                <span className={`${he ? 'mr-3' : 'ml-3'} text-[10px] text-slate-400`}>{he ? steps[active].title : steps[active].titleEn}</span>
              </div>
              <div ref={viewportRef} className="relative bg-[#f6f9fc] overflow-hidden" style={{ height: STEP_HEIGHT * scale }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={steps[active].key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="absolute top-0 left-0 pointer-events-none"
                    style={{ width: STEP_WIDTH, transformOrigin: 'top left', transform: `scale(${scale})` }}
                  >
                    <Active />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div className="flex justify-center gap-2.5 mt-6">
              {steps.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => setActive(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${i === active ? 'bg-nx-primary w-7' : 'bg-slate-300 w-2.5 hover:bg-slate-400'}`}
                  aria-label={he ? `שלב ${i + 1}` : `Step ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Slide 9: Commercial model — an offer that scales with you ───────────────
function CommercialOfferSection() {
  const { language } = useLanguage();
  const he = language === 'he';

  type OfferCard = { big: string; tone: 'sky' | 'teal'; ltr: boolean; title: string; desc: string };

  const baseCards: OfferCard[] = he
    ? [
        { big: 'ללא תחתית', tone: 'sky', ltr: false, title: 'מתנות בסיס', desc: 'מתחילים בכל היקף - בלי מינימום ובלי מגבלה.' },
        { big: '6 חודשים', tone: 'teal', ltr: false, title: 'הארנק חינם', desc: 'בהתחייבות לשנתיים - חצי השנה הראשונה של הארנק במתנה.' },
      ]
    : [
        { big: 'No minimum', tone: 'sky', ltr: false, title: 'Base gifts', desc: 'Start at any scale - no minimum and no limit.' },
        { big: '6 months', tone: 'teal', ltr: false, title: 'Wallet free', desc: 'With a two-year commitment - the first six months of the wallet on us.' },
      ];

  const choiceCards: OfferCard[] = he
    ? [
        { big: '₪100K+', tone: 'sky', ltr: true, title: 'הנחת היקף', desc: 'מעל ₪100,000 בשנה - הנחה על מלוא תקציב הרווחה.' },
        { big: '40%', tone: 'teal', ltr: true, title: 'החזר על אי-מימוש', desc: 'בתום תקופת המימוש, 40% מערך המתנות שלא נוצלו חוזר לארגון.' },
      ]
    : [
        { big: '₪100K+', tone: 'sky', ltr: true, title: 'Volume discount', desc: 'Over ₪100,000 a year - a discount on the entire welfare budget.' },
        { big: '40%', tone: 'teal', ltr: true, title: 'Refund on non-realization', desc: 'At the end of the redemption period, 40% of the value of unredeemed gifts returns to the organization.' },
      ];

  const renderCard = (c: OfferCard) => {
    const grad = c.tone === 'teal' ? gradText('#0D9488', '#34D399') : gradientText;
    return (
      <div className={`h-full rounded-[18px] p-8 md:p-10 bg-white/[0.06] border border-white/10 ${he ? 'text-right' : 'text-left'}`}>
        <div className="text-5xl md:text-6xl font-bold leading-none mb-4" style={{ ...grad, direction: c.ltr ? 'ltr' : undefined, textAlign: he ? 'right' : 'left' }}>{c.big}</div>
        <div className="text-2xl md:text-3xl font-semibold mb-3 text-white">{c.title}</div>
        <div className="text-base md:text-lg leading-relaxed text-white/70">{c.desc}</div>
      </div>
    );
  };

  return (
    <section className="relative overflow-hidden bg-[#F6F9FC]">
      {/* Dark diagonal band (parallelogram) - matches the accumulation section */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 120% at 15% 20%,#0E2F50,#0A2540 60%,#071a30)', clipPath: 'polygon(0 0, 100% 6%, 100% 100%, 0 94%)' }}
      >
        <div className="absolute rounded-full" style={{ top: -160, insetInlineEnd: -120, width: 560, height: 560, background: 'radial-gradient(circle,rgba(14,165,233,0.4),transparent 65%)', filter: 'blur(50px)' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-36 md:pt-44 pb-28">
        <FadeInSection>
          <div className={`mb-12 ${he ? 'text-right' : 'text-left'}`}>
            <span className="text-sm font-semibold tracking-[0.2em] uppercase mb-4 block" style={{ color: '#38BDF8' }}>
              {he ? 'המודל המסחרי' : 'The Commercial Model'}
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">
              {he ? 'הצעה שמשתלמת ככל שגדלים' : 'An offer that pays off as you grow'}
            </h2>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed">
              {he ? (
                <>בלי תקרת מתנות - <strong className="text-white font-semibold">עם תמריצים שגדלים יחד איתכם.</strong></>
              ) : (
                <>No gift ceiling - <strong className="text-white font-semibold">with incentives that grow alongside you.</strong></>
              )}
            </p>
          </div>
        </FadeInSection>

        {/* Base terms - always included */}
        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          {baseCards.map((c, i) => (
            <FadeInSection key={i} className="h-full">{renderCard(c)}</FadeInSection>
          ))}
        </div>

        {/* Then choose ONE reward model - the two are alternatives */}
        <FadeInSection>
          <div className="mt-12 mb-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-sm font-bold text-white/50 uppercase tracking-wider">{he ? 'ובוחרים מודל תגמול אחד' : 'and choose one reward model'}</span>
            <span className="h-px flex-1 bg-white/15" />
          </div>
        </FadeInSection>
        <div className="flex flex-col md:flex-row items-stretch gap-4">
          <div className="flex-1"><FadeInSection className="h-full">{renderCard(choiceCards[0])}</FadeInSection></div>
          <div className="flex items-center justify-center">
            <span className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-base font-bold text-white">{he ? 'או' : 'or'}</span>
          </div>
          <div className="flex-1"><FadeInSection className="h-full">{renderCard(choiceCards[1])}</FadeInSection></div>
        </div>
      </div>
    </section>
  );
}

// ─── Extra: welfare-budget ROI calculator (compounding-cashback loop) ────────
// Effective value = budget / (1 - cashback): every purchase earns cashback that
// buys again, and again - a geometric series that sums to that multiplier.
function RoiCalculatorSection() {
  const { language } = useLanguage();
  const he = language === 'he';
  const BackArrow = he ? ArrowLeft : ArrowRight;

  const [budget, setBudget] = useState(1500);
  const [employees, setEmployees] = useState(100);
  const [cashback, setCashback] = useState(50); // percent, 20..60
  const [nonRealization, setNonRealization] = useState(40); // percent, 0..100

  const c = Math.min(Math.max(cashback, 0), 95) / 100;
  const perEmployeeEffective = budget > 0 ? budget / (1 - c) : 0;
  const boostPerEmployee = perEmployeeEffective - budget;
  const totalX = budget * employees;
  const totalY = perEmployeeEffective * employees;
  const NEXUS_REFUND_PCT = 40;
  const unrealizedTotal = totalX * (nonRealization / 100);
  const refundTotal = unrealizedTotal * (NEXUS_REFUND_PCT / 100);
  const effectivePct = budget > 0 ? Math.round((perEmployeeEffective / budget) * 100) : 0;
  const boostPct = budget > 0 ? Math.round((boostPerEmployee / budget) * 100) : 0;
  const refundPct = totalX > 0 ? Math.round((refundTotal / totalX) * 100) : 0;
  const totalValueCreated = totalY + refundTotal;
  const aggMultiplier = totalX > 0 ? totalValueCreated / totalX : 0;
  const multiplierLabel = `×${Math.round(aggMultiplier * 10) / 10}`;

  const fmt = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

  const numField = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    suffix?: string,
  ) => (
    <label className={`block ${he ? 'text-right' : 'text-left'}`}>
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-nx-primary transition-colors overflow-hidden">
        {suffix && <span className="px-3 text-slate-400 text-lg select-none">{suffix}</span>}
        <input
          type="number"
          min={0}
          value={value === 0 ? '' : value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className={`w-full py-3.5 px-3 text-lg font-bold text-slate-900 outline-none tabular-nums bg-transparent ${he ? 'text-right' : 'text-left'}`}
          dir="ltr"
        />
      </div>
    </label>
  );

  return (
    <section className="py-32 bg-[#F1F5F9]">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className={`mb-16 ${he ? 'text-right' : 'text-left'}`}>
            <span className="text-nx-primary font-bold text-sm tracking-[0.2em] uppercase mb-4 block">
              {he ? 'מחשבון' : 'Calculator'}
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight mb-4">
              {he ? 'כמה תקציב הרווחה שלכם באמת שווה?' : 'How much is your welfare budget really worth?'}
            </h2>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl">
              {he
                ? 'כל קנייה מזכה בקאשבק, שאיתו קונים שוב - וכך שוב ושוב. זה מכפיל את כוח הקנייה של אותו תקציב בדיוק.'
                : 'Every purchase earns cashback that buys again, and again. That multiplies the buying power of the very same budget.'}
            </p>
          </div>
        </FadeInSection>

        <FadeInSection>
          <div className="rounded-[22px] overflow-hidden border border-slate-200 shadow-xl bg-white">
            <div className="grid lg:grid-cols-2 gap-0">
            {/* Inputs */}
            <div className="p-8 md:p-12 space-y-8">
              {numField(he ? 'תקציב רווחה שנתי לעובד' : 'Annual welfare budget per employee', budget, setBudget, '₪')}
              {numField(he ? 'כמות עובדים' : 'Number of employees', employees, setEmployees)}

              <div className={he ? 'text-right' : 'text-left'}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">{he ? 'אחוז קאשבק ממוצע' : 'Average cashback rate'}</span>
                  <span className="text-lg font-bold text-nx-primary tabular-nums" dir="ltr">{cashback}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={60}
                  step={1}
                  value={cashback}
                  onChange={(e) => setCashback(Number(e.target.value))}
                  className="mt-3 w-full accent-nx-primary"
                  dir="ltr"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1 tabular-nums" dir="ltr">
                  <span>20%</span>
                  <span>60%</span>
                </div>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  {he
                    ? 'אחוז הקאשבק משתנה בין רשת לרשת ובין קטגוריה לקטגוריה - בחרו הערכה ממוצעת.'
                    : 'The cashback rate varies between chains and categories - pick an average estimate.'}
                </p>
              </div>
            </div>

            {/* Result */}
            <div
              className={`p-8 md:p-12 text-white flex flex-col justify-center ${he ? 'text-right' : 'text-left'}`}
              style={{ background: 'radial-gradient(120% 120% at 80% 10%,#0E2F50,#0A2540 70%)' }}
            >
              <div className="text-sm font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: '#38BDF8' }}>
                {he ? 'הערך האפקטיבי לעובד' : 'Effective value per employee'}
              </div>
              <div className="text-6xl md:text-7xl font-bold leading-none" style={{ ...gradientText, direction: 'ltr', textAlign: he ? 'right' : 'left' }}>
                {fmt(perEmployeeEffective)}
              </div>
              <div className="mt-2 text-lg font-semibold" style={{ color: '#38BDF8' }}>
                {he ? `${effectivePct}% מהתקציב המקורי` : `${effectivePct}% of the original budget`}
              </div>
              <p className="text-lg md:text-xl text-white/85 leading-relaxed mt-5">
                {he ? (
                  <>שמתם <strong className="text-white">{fmt(budget)}</strong> לעובד - בפועל יצרתם <strong style={gradientText}>{fmt(perEmployeeEffective)}</strong> של ערך.</>
                ) : (
                  <>You put in <strong className="text-white">{fmt(budget)}</strong> per employee - you actually created <strong style={gradientText}>{fmt(perEmployeeEffective)}</strong> of value.</>
                )}
              </p>

              <div className="mt-8 pt-6 border-t border-white/15 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl md:text-3xl font-bold tabular-nums" dir="ltr" style={{ textAlign: he ? 'right' : 'left' }}>+{fmt(boostPerEmployee)}</div>
                  <div className="text-sm text-white/60 mt-1">{he ? `בוסט לכל עובד (+${boostPct}%)` : `Boost per employee (+${boostPct}%)`}</div>
                </div>
                <div>
                  <div className="text-2xl md:text-3xl font-bold tabular-nums" dir="ltr" style={{ textAlign: he ? 'right' : 'left' }}>{fmt(totalY)}</div>
                  <div className="text-sm text-white/60 mt-1">
                    {he ? `ערך כולל (מ-${fmt(totalX)})` : `Total value (from ${fmt(totalX)})`}
                  </div>
                </div>
              </div>
            </div>
            </div>

            {/* Non-realization: a 40% refund on unredeemed budget */}
            <div className={`border-t border-slate-200 p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center ${he ? 'text-right' : 'text-left'}`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">{he ? 'אחוז אי-מימוש' : 'Non-realization rate'}</span>
                  <span className="text-lg font-bold text-nx-primary tabular-nums" dir="ltr">{nonRealization}%</span>
                </div>
                <input type="range" min={0} max={100} step={1} value={nonRealization} onChange={(e) => setNonRealization(Number(e.target.value))} className="mt-3 w-full accent-nx-primary" dir="ltr" />
                <div className="flex justify-between text-xs text-slate-400 mt-1 tabular-nums" dir="ltr"><span>0%</span><span>100%</span></div>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  {he
                    ? 'גם על תקציב שלא נוצל אתם מרוויחים - 40% מערך המתנות שלא מומשו חוזר לארגון.'
                    : 'You gain even on unused budget - 40% of the value of unredeemed gifts returns to the organization.'}
                </p>
              </div>
              <div className="rounded-2xl bg-[#F6F9FC] border border-slate-200 p-6">
                <div className="text-sm text-slate-500 mb-1">{he ? 'החזר לארגון על אי-מימוש' : 'Refund on non-realization'}</div>
                <div className="text-4xl md:text-5xl font-bold" style={{ ...gradText('#0D9488', '#34D399'), direction: 'ltr', textAlign: he ? 'right' : 'left' }}>{fmt(refundTotal)}</div>
                <div className="text-sm font-semibold mt-1" style={{ color: '#0D9488' }}>
                  {he ? `${refundPct}% מהתקציב` : `${refundPct}% of the budget`}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  {he ? `40% מתוך ₪${Math.round(unrealizedTotal).toLocaleString('he-IL')} שלא מומשו` : `40% of ₪${Math.round(unrealizedTotal).toLocaleString('he-IL')} unredeemed`}
                </div>
              </div>
            </div>

            {/* Aggregate closer: multipliers, not discount percentages */}
            <div className="border-t border-slate-200 p-8 md:p-12 text-white" style={{ background: 'radial-gradient(120% 120% at 80% 10%,#0E2F50,#0A2540 70%)' }}>
              <div className={`grid md:grid-cols-2 gap-8 items-center ${he ? 'text-right' : 'text-left'}`}>
                <div>
                  <p className="text-2xl md:text-3xl font-bold leading-snug">
                    {he ? (
                      <>המתחרים מדברים ב<span className="text-white/60">אחוזי הנחה</span>.<br /><span style={gradientText}>אנחנו מדברים במכפילים.</span></>
                    ) : (
                      <>Competitors talk in <span className="text-white/60">discount percentages</span>.<br /><span style={gradientText}>We talk in multipliers.</span></>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-4 mt-6">
                    <a
                      href="#cta-final"
                      className="group inline-flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/85 text-white font-semibold px-8 py-4 rounded-lg transition-all duration-300 hover:shadow-xl hover:shadow-nx-primary/30 text-base"
                    >
                      {he ? 'התחל עכשיו' : 'Get Started'}
                      <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                        <BackArrow size={16} className="inline" />
                      </span>
                    </a>
                    <a
                      href="#cta-final"
                      className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/25 text-white font-semibold px-8 py-4 rounded-lg transition-all text-base"
                    >
                      {he ? 'קבל הצעת מחיר מותאמת' : 'Get a custom quote'}
                    </a>
                  </div>
                </div>
                <div className={he ? 'md:text-left' : 'md:text-right'}>
                  <div className="text-6xl md:text-7xl font-bold leading-none" style={{ ...gradientText, direction: 'ltr', textAlign: he ? 'left' : 'right' }}>{multiplierLabel}</div>
                  <div className="text-sm text-white/70 mt-3">
                    {he ? `מתקציב ${fmt(totalX)} יצרתם ${fmt(totalValueCreated)} - מתנה אפקטיבית + החזר לארגון` : `From ${fmt(totalX)} you created ${fmt(totalValueCreated)} - effective gift + org refund`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Slide 11: How we compare — the Nexus difference ─────────────────────────
function CompetitorsSection() {
  const { language } = useLanguage();
  const he = language === 'he';

  const rows = he
    ? [
        { edge: 'מנוע קאשבק לעובד', benefit: 'אף פתרון אחר לא נותן צבירה לעובד - שובר חד-פעמי מול ארנק חי.' },
        { edge: 'החזר 40% + דוחות ושליטה', benefit: 'הערך האמיתי הוא השקיפות והשליטה סביב ההחזר.' },
        { edge: 'גם מתנה וגם צבירה', benefit: 'אותו תקציב עובד פעמיים - ערך שאין לו מקבילה בשובר רגיל.' },
        { edge: 'הפעלה בנציג או ב-60 שניות', benefit: 'בלי החיכוך של פתרונות אחרים - מהחלטה למתנה במהירות.' },
        { edge: 'שליטה מלאה במימוש', benefit: 'גמישות מלאה מול תו בודד ונוקשה.' },
      ]
    : [
        { edge: 'A cashback engine for the employee', benefit: 'No other solution gives the employee accumulation - a one-time voucher vs a living wallet.' },
        { edge: 'A 40% refund + reports and control', benefit: 'The real value is the transparency and control around the refund.' },
        { edge: 'Both a gift and accumulation', benefit: 'The same budget works twice - value a plain voucher cannot match.' },
        { edge: 'Activation by a rep or in 60 seconds', benefit: 'Without the friction of other solutions - from decision to gift, fast.' },
        { edge: 'Full control over redemption', benefit: 'Complete flexibility vs a single rigid voucher.' },
      ];

  return (
    <section className="py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className={`mb-16 ${he ? 'text-right' : 'text-left'}`}>
            <span className="text-nx-primary font-bold text-sm tracking-[0.2em] uppercase mb-4 block">
              {he ? 'השוואה' : 'Comparison'}
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight">
              {he ? 'מול המתחרים' : 'How we compare'}
            </h2>
          </div>
        </FadeInSection>

        <FadeInSection>
          <div className="overflow-hidden rounded-[18px] border border-slate-200">
            <div className={`grid grid-cols-1 md:grid-cols-[38%_1fr] bg-slate-50 text-slate-400 text-xs md:text-sm font-semibold uppercase tracking-wider ${he ? 'text-right' : 'text-left'}`}>
              <div className="px-6 md:px-8 py-4">{he ? 'הבידול של נקסוס' : 'The Nexus difference'}</div>
              <div className="px-6 md:px-8 py-4 hidden md:block">{he ? 'מה זה אומר בשבילכם' : 'What it means for you'}</div>
            </div>
            {rows.map((r, i) => (
              <div key={i} className={`grid grid-cols-1 md:grid-cols-[38%_1fr] border-t border-slate-100 ${he ? 'text-right' : 'text-left'}`}>
                <div className="px-6 md:px-8 py-5 flex items-start gap-3">
                  <CheckCircle size={20} className="text-nx-primary shrink-0 mt-0.5" />
                  <span className="text-lg font-semibold text-slate-900">{r.edge}</span>
                </div>
                <div className="px-6 md:px-8 pb-5 md:py-5 text-base md:text-lg text-slate-500 leading-relaxed">{r.benefit}</div>
              </div>
            ))}
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Section 6: Use Cases ─────────────────────────────────────────────────────
function UseCasesSection() {
  const { language } = useLanguage();
  const he = language === 'he';
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 420;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const useCases = he ? [
    { title: 'מתנות לחג לעובדים', desc: 'שלחו מתנות לחג לכל העובדים אוטומטית - וכל מתנה ממשיכה לצבור קאשבק לארנק האישי.', image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&q=80', gradient: 'from-red-500 to-orange-500' },
    { title: 'מתנות ליום הולדת', desc: 'הגדירו תקציב ליום הולדת וזה קורה אוטומטית. העובד בוחר, נהנה, וצובר קאשבק.', image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80', gradient: 'from-pink-500 to-rose-500' },
    { title: 'בונוסים ותמריצים', desc: 'תגמלו עובדים מצטיינים במתנה מיידית - בלי רכש מסורבל, עם ערך שנשאר בארנק.', image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80', gradient: 'from-emerald-500 to-teal-500' },
    { title: 'תקציב רווחה שנתי', desc: 'הקצו תקציב שנתי לכל עובד, ותנו לו לבחור, לממש ולצבור קאשבק לאורך כל השנה.', image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80', gradient: 'from-blue-500 to-indigo-500' },
  ] : [
    { title: 'Holiday Gifts for Employees', desc: 'Send holiday gifts to all employees automatically - and every gift keeps earning cashback for the personal wallet.', image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&q=80', gradient: 'from-red-500 to-orange-500' },
    { title: 'Birthday Gifts', desc: 'Set a birthday budget and it happens automatically. The employee chooses, enjoys, and earns cashback.', image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80', gradient: 'from-pink-500 to-rose-500' },
    { title: 'Bonuses & Incentives', desc: 'Reward outstanding employees with an instant gift - no cumbersome procurement, with value that stays in the wallet.', image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80', gradient: 'from-emerald-500 to-teal-500' },
    { title: 'Annual Welfare Budget', desc: 'Allocate an annual budget per employee and let them choose, redeem, and earn cashback throughout the year.', image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80', gradient: 'from-blue-500 to-indigo-500' },
  ];

  return (
    <section id="use-cases" className="py-32 bg-slate-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="flex items-end justify-between mb-16">
            <div>
              <span className="text-nx-primary font-bold text-sm tracking-wide mb-3 block">
                {he ? 'שימושים' : 'Use Cases'}
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                {he ? 'איך ארגונים משתמשים בנקסוס' : 'How organizations use Nexus'}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed max-w-2xl">
                {he
                  ? 'מתנה לחג, יום הולדת, בונוס או תקציב שנתי - כל מתנה ממשיכה לצבור קאשבק לעובד. הפעלה בקליק, בנציג או לבד, תוך 60 שניות.'
                  : 'A holiday gift, a birthday, a bonus, or an annual budget - every gift keeps earning cashback. Activate in a click, with a rep or on your own, in 60 seconds.'}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => scroll(he ? 'right' : 'left')}
                className="w-10 h-10 rounded-full border border-slate-200 hover:border-nx-primary hover:text-nx-primary flex items-center justify-center text-slate-400 transition-colors"
                aria-label={he ? 'גלול ימינה' : 'Scroll left'}
              >
                {he ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
              </button>
              <button
                onClick={() => scroll(he ? 'left' : 'right')}
                className="w-10 h-10 rounded-full border border-slate-200 hover:border-nx-primary hover:text-nx-primary flex items-center justify-center text-slate-400 transition-colors"
                aria-label={he ? 'גלול שמאלה' : 'Scroll right'}
              >
                {he ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
              </button>
            </div>
          </div>
        </FadeInSection>

        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto px-1 pt-3 pb-10 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {useCases.map((useCase, i) => (
            <BorderHighlightCard
              key={i}
              className="snap-start shrink-0 w-[340px] md:w-[400px] rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow duration-300 group"
            >
              <div className="h-56 relative overflow-hidden">
                <img
                  src={useCase.image}
                  alt={useCase.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${useCase.gradient} opacity-20`} />
              </div>
              <div className="bg-white p-6 border border-t-0 border-slate-100 rounded-b-2xl">
                <h3 className="text-xl font-bold text-slate-900 mb-3">{useCase.title}</h3>
                <p className="text-slate-600 leading-relaxed">{useCase.desc}</p>
              </div>
            </BorderHighlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ───────────────────────────────────────────────────────────────
function FinalCTASection() {
  const { language } = useLanguage();
  const he = language === 'he';
  const BackArrow = he ? ArrowLeft : ArrowRight;

  return (
    <section id="cta-final" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 bg-nx-blue">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #0D9488, transparent 40%), radial-gradient(circle at 80% 80%, #ff6b9d, transparent 40%)' }} />
      </div>

      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <FadeInSection>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            {he ? 'מוכנים לתת רווחה שחיה כל השנה?' : 'Ready to give welfare that lives all year?'}
          </h2>
          <p className="text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed">
            {he
              ? 'רוב החברות שולחות שובר לחג - וזהו. נקסוס זה ארנק רווחה שחי כל השנה: מתנה, קאשבק על כל תשלום, ושליטה מלאה עם החזר על מה שלא נוצל.'
              : 'Most companies send a holiday voucher, and that is it. Nexus is a welfare wallet that lives all year: a gift, cashback on every payment, and full control with a refund on what goes unused.'}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/85 text-white font-bold px-10 py-4 rounded-lg transition-all duration-300 hover:shadow-xl hover:shadow-nx-primary/30 text-lg"
            >
              {he ? 'התחל עכשיו' : 'Get Started'}
              <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                <BackArrow size={18} className="inline" />
              </span>
            </a>
            <Link
              to={he ? '/he' : '/'}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold px-10 py-4 rounded-lg transition-all text-lg"
            >
              {he ? 'צור קשר עם המכירות' : 'Contact Sales'}
            </Link>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Main Landing Page ───────────────────────────────────────────────────────
export default function NexusLandingPage() {
  const { language } = useLanguage();
  const he = language === 'he';

  useSEO({
    title: he ? 'Nexus | ארנק רווחה שחי כל השנה - מתנות וקאשבק לעובדים' : 'Nexus | A Welfare Wallet That Lives All Year - Gifts & Cashback',
    description: he
      ? 'נקסוס - ארנק הרווחה הדיגיטלי שחי כל השנה. מתנה לחג וגם קאשבק על כל תשלום, עם שקיפות, שליטה והחזר על תקציב שלא נוצל.'
      : 'Nexus - the digital welfare wallet that lives all year. A holiday gift plus cashback on every payment, with transparency, control, and a refund on unused budget.',
    canonical: he ? 'https://nexus-payment.com/he/welfare' : 'https://nexus-payment.com/welfare',
    alternates: {
      he: 'https://nexus-payment.com/he/welfare',
      en: 'https://nexus-payment.com/welfare',
    },
  });

  useEffect(() => {
    const linkId = 'rubik-font-landing';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=block';
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Rubik', 'Inter', sans-serif" }}>
      <Suspense fallback={null}>
        <Navbar />
      </Suspense>
      <HeroSection />
      <VoucherVsWalletSection />
      <CashbackEngineSection />
      <AccumulationSection />
      <PartnersSection />
      <ActivationControlSection />
      <CommercialOfferSection />
      <RoiCalculatorSection />
      <CompetitorsSection />
      <UseCasesSection />
      <FinalCTASection />
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
}
