import { useEffect, lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CreditCard, Link2, RefreshCw, Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import PaymentAnimation, { PaymentPricingPanel, PaymentCheckoutPanel } from '../components/PaymentAnimation';
import AnimatedGradient from '../components/AnimatedGradient';
import { useLanguage } from '../i18n/LanguageContext';
import visaLogo from '../assets/logos/visa-logo-white.svg';
import mastercardLogo from '../assets/logos/mastercard-logo.png';

const Footer = lazy(() => import('../components/Footer'));

// ─── scroll-reveal observer ────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('revealed'); observer.unobserve(e.target); }
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.scroll-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Reusable bullet (icon on right in RTL, left in LTR) ───
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

// ─── Checkmark row (dark-section variant) ─────────────────
function CheckRow({ text }: { text: string }) {
  const { direction } = useLanguage();
  const isRtl = direction === 'rtl';
  return (
    <div className={`flex items-center gap-3 ${isRtl ? '' : 'flex-row-reverse'}`}>
      <Check size={20} className="text-violet-400 flex-shrink-0" />
      <span className="text-white/90 text-lg">{text}</span>
    </div>
  );
}

// ─── Pricing Calculator Section ───────────────────────────
const MILESTONES = [
  { pct: '1.2%', labelHe: 'התחלה',              labelEn: 'Starting rate' },
  { pct: '0.9%', labelHe: 'מעל ₪1M בחודש',     labelEn: 'Above ₪1M/mo'  },
  { pct: '0.8%', labelHe: 'מעל ₪5M בחודש',     labelEn: 'Above ₪5M/mo'  },
  { pct: '0.7%', labelHe: 'מעל ₪10M בחודש',    labelEn: 'Above ₪10M/mo' },
];

function PricingCalculatorSection({ he, signupLink }: { he: boolean; isRtl: boolean; signupLink: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const fillPct = (activeIdx / (MILESTONES.length - 1)) * 100;

  return (
    <section className="scroll-reveal relative py-20 md:py-32 bg-slate-50 overflow-x-hidden">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block bg-stripe-purple/10 text-stripe-purple text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
            {he ? 'תמחור' : 'Pricing'}
          </span>
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            {he ? 'עמלת סליקה לעסקים בישראל' : 'Processing Fees for Israeli Businesses'}
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm leading-relaxed">
            {he ? 'ככל שנפח הסליקה שלכם גדל — העמלה יורדת.' : 'The more you process, the lower your rate.'}
          </p>
        </div>

        {/* Current rate display */}
        <div className="text-center mb-12">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">
            {he ? 'העמלה שלך' : 'Your rate'}
          </span>
          <span className="text-8xl font-black text-stripe-purple transition-all duration-300">
            {MILESTONES[activeIdx].pct}
          </span>
        </div>

        {/* Progress bar — always LTR so slider behaves correctly */}
        <div className="relative mb-16" dir="ltr">
          {/* Track background */}
          <div className="relative h-2 bg-slate-200 rounded-full mx-4">
            {/* Fill */}
            <div
              className="absolute inset-y-0 left-0 bg-stripe-purple rounded-full transition-all duration-300"
              style={{ width: `${fillPct}%` }}
            />

            {/* Milestone dots */}
            {MILESTONES.map((m, i) => {
              const pos = (i / (MILESTONES.length - 1)) * 100;
              const reached = activeIdx >= i;
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                  style={{ left: `${pos}%` }}
                  aria-label={he ? m.labelHe : m.labelEn}
                >
                  {/* dot */}
                  <div className={`w-6 h-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center
                    ${reached
                      ? 'bg-stripe-purple border-stripe-purple shadow-lg shadow-stripe-purple/40 scale-110'
                      : 'bg-white border-slate-300 group-hover:border-stripe-purple/50'}`}
                  >
                    {reached && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                  </div>
                  {/* % label above */}
                  <div className="absolute bottom-9 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
                    <span className={`text-base font-black transition-colors duration-300 ${reached ? 'text-stripe-purple' : 'text-slate-300'}`}>
                      {m.pct}
                    </span>
                  </div>
                  {/* volume label below */}
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
                    <span className={`text-xs font-semibold transition-colors duration-300 ${reached ? 'text-slate-600' : 'text-slate-400'}`}>
                      {he ? m.labelHe : m.labelEn}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Invisible range input for drag behaviour */}
          <input
            type="range"
            min={0} max={MILESTONES.length - 1} step={1}
            value={activeIdx}
            onChange={(e) => setActiveIdx(Number(e.target.value))}
            className="absolute inset-x-4 top-0 h-2 w-[calc(100%-2rem)] opacity-0 cursor-pointer"
            style={{ margin: 0 }}
          />
        </div>

        {/* CTA */}
        <div className="text-center mt-4">
          <Link to={signupLink} className="inline-block bg-stripe-purple text-white font-semibold px-10 py-3 rounded-xl hover:bg-violet-500 transition-colors">
            {he ? 'פתחו חשבון סליקה' : 'Open a payments account'}
          </Link>
        </div>

      </div>
    </section>
  );
}

// ─── Component ────────────────────────────────────────────
export default function PaymentsPage() {
  const { language, direction } = useLanguage();
  useScrollReveal();

  const he = language === 'he';
  const signupLink = he ? '/he/signup' : '/signup';
  const isRtl = direction === 'rtl';

  return (
    <div dir={direction} className="min-h-screen bg-white">
      <Navbar variant="dark" />

      {/* Override payment-stage: no background, no frame, no hover effects — phone only */}
      <style>{`
        .payments-hero-anim { pointer-events: none; }
        .payments-hero-anim .payment-stage {
          overflow: visible !important; background: none !important; border: none !important;
          box-shadow: none !important; outline: none !important;
        }
        .payments-hero-anim .payment-stage::before {
          display: none !important; content: none !important;
        }
        .payments-hero-anim .payment-phone { left: 50% !important; right: auto !important; top: 50% !important; transform: translate(-50%, -50%) !important; }
        [dir="rtl"] .payments-hero-anim .payment-phone { left: 50% !important; right: auto !important; top: 50% !important; transform: translate(-50%, -50%) !important; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════
          HERO — light gray background matching home page
      ══════════════════════════════════════════════════════════ */}
      <div className="relative">
        <section className="relative pt-32 pb-20 bg-slate-50 overflow-x-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

              {/* ── Text column (DOM first → right in RTL, left in LTR) ── */}
              <div className="text-right">

                {/* Label chip */}
                <div className={`inline-flex items-center gap-2 bg-stripe-purple/10 border border-stripe-purple/20 rounded-full px-4 py-1.5 text-sm font-medium mb-6 text-stripe-purple ${isRtl ? '' : 'flex-row-reverse'}`}>
                  <CreditCard size={13} />
                  <span>{he ? 'סליקה' : 'Payments'}</span>
                </div>

                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-slate-900">
                  {he ? 'סליקה חכמה לעסקים' : 'Smart Payments for Business'}
                </h1>

                <p className="text-lg text-slate-700 mb-4 leading-relaxed">
                  {he
                    ? 'קבלו תשלומים מכל מקום – באתר, בלינקים, במנויים או בתוך קהילות Nexus.'
                    : 'Accept payments from anywhere – on your website, via links, subscriptions, or within Nexus communities.'}
                </p>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                  {he
                    ? 'מערכת תשלומים אחת שמאפשרת לכם לנהל את כל ההכנסות של העסק במקום אחד.'
                    : 'One payments system that lets you manage all your business revenue in one place.'}
                </p>

                {/* ✔ Bullets */}
                <ul className="space-y-3 mb-10">
                  {(he
                    ? ['סליקת אשראי וארנקים דיגיטליים', 'מנויים ותשלומים חוזרים', 'קישורי תשלום ועמודי Checkout', 'אפשרות למכור גם בתוך קהילות וארגונים']
                    : ['Credit & digital wallet processing', 'Subscriptions & recurring payments', 'Payment links & Checkout pages', 'Sell within communities and organizations']
                  ).map((item) => (
                    <li key={item} className={`flex items-center gap-3 ${isRtl ? '' : 'flex-row-reverse'}`}>
                      <Check size={16} className="text-stripe-purple flex-shrink-0" />
                      <span className="text-slate-700">{item}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA buttons */}
                <div className={`flex flex-wrap gap-4 ${isRtl ? 'justify-start' : 'justify-end'}`}>
                  <Link
                    to={signupLink}
                    className="inline-block bg-stripe-purple text-white font-semibold px-8 py-3 rounded-xl hover:bg-violet-500 transition-colors"
                  >
                    {he ? 'פתחו חשבון סליקה' : 'Open a payments account'}
                  </Link>
                  <Link
                    to={signupLink}
                    className="inline-block border border-slate-300 bg-white text-slate-700 font-semibold px-8 py-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    {he ? 'קבעו שיחת היכרות' : 'Schedule a call'}
                  </Link>
                </div>
              </div>

              {/* ── Animation column — phone only ── */}
              <div className="payments-hero-anim payment-card-expandable relative h-[520px] hidden lg:block">
                <PaymentAnimation show="phone" />
              </div>

            </div>
          </div>
        </section>

        {/* ── Gradient diagonal — visible parallelogram strip (wider, tube illusion) ── */}
        <div className="relative z-10 h-80 -mt-16">
          <AnimatedGradient clipPath={isRtl ? "polygon(0 0, 100% 25%, 100% 100%, 0 75%)" : "polygon(0 0, 100% 25%, 100% 100%, 0 75%)"} />
          {/* Tube/cylinder highlight overlay — same clip to create 3D pipe illusion */}
          <div className="absolute inset-0 pointer-events-none" style={{
            clipPath: isRtl ? "polygon(0 0, 100% 25%, 100% 100%, 0 75%)" : "polygon(0 0, 100% 25%, 100% 100%, 0 75%)",
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(0,0,0,0.18) 100%)'
          }} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          S2 — קבלו תשלומים מכל מקום  +  דף מסלולי תשלום
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative z-0 mt-0 py-20 md:py-32 bg-white overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* ── Text column ── */}
            <div className="text-right">
              <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4">
                {he ? 'תשלומים' : 'Payments'}
              </p>
              <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-6 leading-tight">
                {he ? 'קבלו תשלומים מכל מקום' : 'Accept payments from anywhere'}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-10">
                {he
                  ? 'עם Nexus אתם יכולים לקבל תשלומים מכל ערוץ שבו העסק שלכם פועל.'
                  : 'With Nexus you can accept payments through every channel your business operates on.'}
              </p>
              <ul className="space-y-4 mb-8">
                {(he
                  ? ['כרטיסי אשראי', 'Apple Pay ו-Google Pay', 'Bit ו-PayPal', 'חיוב חשבון בנק', 'תשלומים בינלאומיים']
                  : ['Credit cards', 'Apple Pay & Google Pay', 'Bit & PayPal', 'Bank account debit', 'International payments']
                ).map((item) => <Bullet key={item} text={item} />)}
              </ul>
              <p className="text-slate-500">
                {he
                  ? 'התחילו לגבות תשלומים באתר שלכם, במובייל או דרך קישורי תשלום.'
                  : 'Start accepting payments on your website, mobile, or via payment links.'}
              </p>
            </div>

            {/* ── Payment method logos ── */}
            <div className="flex flex-col items-center gap-8">
              <div className="grid grid-cols-3 gap-6 w-full max-w-md">
                {[
                  { src: visaLogo, alt: 'Visa', label: 'Visa' },
                  { src: mastercardLogo, alt: 'Mastercard', label: 'Mastercard' },
                  { src: '/bit-logo.png', alt: 'Bit', label: 'Bit' },
                  { src: '/paybox-logo.png', alt: 'PayBox', label: 'PayBox' },
                  { src: '/apple-pay.png', alt: 'Apple Pay', label: 'Apple Pay' },
                  { src: '/google-pay.png', alt: 'Google Pay', label: 'Google Pay' },
                ].map((pm) => (
                  <div key={pm.alt} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center gap-2 hover:shadow-md hover:border-stripe-purple/30 transition-all duration-300">
                    <img src={pm.src} alt={pm.alt} className="h-8 object-contain" />
                    <span className="text-xs text-slate-500 font-medium">{pm.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-400">{he ? 'ועוד מגוון אמצעי תשלום נוספים' : 'And many more payment methods'}</p>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          S3 — קישורי תשלום ו-Checkout
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 overflow-x-hidden">
        {/* Diagonal bg */}
        <div
          className="absolute inset-0 bg-slate-50"
          style={{
            clipPath: isRtl
              ? 'polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 80px))'
              : 'polygon(0 0, 100% 0, 100% calc(100% - 80px), 0 100%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

            <div className="text-right">
              <p className={`text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2 ${isRtl ? '' : 'flex-row-reverse'}`}>
                <Link2 size={14} />
                {he ? 'קישורי תשלום' : 'Payment Links'}
              </p>
              <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-6 leading-tight">
                {he ? 'קישורי תשלום ו-Checkout' : 'Payment Links & Checkout'}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                {he
                  ? 'שלחו ללקוח קישור – וקבלו תשלום מיד.'
                  : 'Send a link to your customer – and get paid immediately.'}
              </p>
              <ul className="space-y-4">
                {(he
                  ? ['Payment Links', 'עמודי Checkout מוכנים', 'גבייה מהירה ללא פיתוח']
                  : ['Payment Links', 'Ready-made Checkout pages', 'Fast collection without development']
                ).map((item) => <Bullet key={item} text={item} />)}
              </ul>
            </div>

            {/* ── Checkout panel, staggered section entrance triggered by parent section.revealed ── */}
            <div className="checkout-autoplay flex justify-center lg:justify-end items-start overflow-hidden">
              <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center', marginBottom: '-60px' }}>
                <PaymentCheckoutPanel />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          S4 — מנויים ותשלומים חוזרים
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-white overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

            <div className="text-right">
              <p className={`text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2 ${isRtl ? '' : 'flex-row-reverse'}`}>
                <RefreshCw size={14} />
                {he ? 'מנויים' : 'Subscriptions'}
              </p>
              <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-6 leading-tight">
                {he ? 'מנויים ותשלומים חוזרים' : 'Subscriptions & Recurring Payments'}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                {he
                  ? 'נהלו הכנסות קבועות בצורה פשוטה.'
                  : 'Manage predictable revenue simply.'}
              </p>
              <ul className="space-y-4">
                {(he
                  ? ['חיוב חודשי או שנתי', 'שמירת אמצעי תשלום', 'ניהול מנויים']
                  : ['Monthly or annual billing', 'Saved payment methods', 'Subscription management']
                ).map((item) => <Bullet key={item} text={item} icon={RefreshCw} />)}
              </ul>
            </div>

            {/* ── Pricing plans panel, staggered entrance triggered by parent section.revealed ── */}
            <div className="pricing-autoplay flex justify-center lg:justify-end items-start">
              <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center', marginBottom: '-60px' }}>
                <PaymentPricingPanel />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          S5 — עמלת סליקה + מחשבון
      ══════════════════════════════════════════════════════════ */}
      <PricingCalculatorSection he={he} isRtl={isRtl} signupLink={signupLink} />

      {/* ══════════════════════════════════════════════════════════
          S6 — הבידול שלנו (dark)
      ══════════════════════════════════════════════════════════ */}
      <section
        className="scroll-reveal relative py-20 md:py-32 overflow-x-hidden"
        style={{ background: 'linear-gradient(135deg, #0A2540 0%, #1a1f5e 60%, #0A2540 100%)' }}
      >
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #635BFF 0%, transparent 70%)' }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl ml-auto text-right">
            <p className={`text-violet-300 font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2 ${isRtl ? '' : 'flex-row-reverse'}`}>
              <Users size={14} />
              {he ? 'הבידול שלנו' : 'Our Difference'}
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight mb-6 leading-tight">
              {he ? 'סליקה שמביאה גם לקוחות' : 'Payments that bring you customers'}
            </h2>
            <p className="text-lg text-white/70 leading-relaxed mb-10">
              {he
                ? 'בניגוד לחברות סליקה רגילות, עסקים המשתמשים במערכת התשלומים של Nexus יכולים גם להציע מוצרים, שירותים והטבות בתוך קהילות ומועדוני צרכנות.'
                : 'Unlike regular payment processors, businesses using Nexus payments can also offer products, services and benefits inside communities and consumer clubs.'}
            </p>
            <p className="text-white/60 font-semibold mb-6 text-sm uppercase tracking-wider">
              {he ? 'כך תוכלו:' : 'This means:'}
            </p>
            <div className="space-y-4">
              {(he
                ? ['להגיע לקהלים חדשים', 'להגדיל מכירות', 'להיחשף לקהילות פעילות']
                : ['Reach new audiences', 'Increase sales', 'Gain exposure in active communities']
              ).map((item) => <CheckRow key={item} text={item} />)}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative py-24 overflow-hidden bg-gradient-to-br from-stripe-blue to-violet-900 text-white">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-15 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)' }}
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-right">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {he ? 'התחילו לסלוק עם Nexus' : 'Start accepting payments with Nexus'}
          </h2>
          <p className="text-white/70 text-lg mb-10 leading-relaxed">
            {he
              ? 'הצטרפו לעסקים שכבר משתמשים במערכת התשלומים של Nexus כדי לנהל את התשלומים שלהם ולהגדיל את הפעילות העסקית.'
              : 'Join businesses already using Nexus payments to manage their payments and grow their business.'}
          </p>
          <div className="flex flex-wrap gap-4 justify-end">
            <Link
              to={signupLink}
              className="inline-block bg-stripe-purple text-white font-semibold px-10 py-3 rounded-xl hover:bg-violet-500 transition-colors"
            >
              {he ? 'פתחו חשבון סליקה' : 'Open a payments account'}
            </Link>
            <Link
              to={signupLink}
              className="inline-block border border-white/30 bg-white/10 text-white font-semibold px-10 py-3 rounded-xl hover:bg-white/20 transition-colors"
            >
              {he ? 'קבעו שיחת היכרות' : 'Schedule a call'}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <Suspense fallback={<div className="h-40 bg-slate-900" />}>
        <Footer />
      </Suspense>
    </div>
  );
}
