import { useEffect, lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CreditCard, Link2, RefreshCw, Users, Zap } from 'lucide-react';
import Navbar from '../components/Navbar';
import PaymentAnimation, { PaymentPricingPanel, PaymentCheckoutPanel } from '../components/PaymentAnimation';
import AnimatedGradient from '../components/AnimatedGradient';
import BorderHighlightCard from '../components/BorderHighlightCard';
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

// ─── Transaction Overlay — floating notifications on phone ───
const CLEARING_TRANSACTIONS_EN = [
  { merchant: 'Online Store', amount: '₪1,250', time: 'Now' },
  { merchant: 'Chef Restaurant', amount: '₪480', time: '2 min ago' },
  { merchant: 'Fitness Studio', amount: '₪320', time: '5 min ago' },
  { merchant: 'Electronics Shop', amount: '₪2,100', time: '8 min ago' },
];

const CLEARING_TRANSACTIONS_HE = [
  { merchant: 'חנות אונליין', amount: '₪1,250', time: 'עכשיו' },
  { merchant: 'מסעדת השף', amount: '₪480', time: 'לפני 2 דק׳' },
  { merchant: 'סטודיו כושר', amount: '₪320', time: 'לפני 5 דק׳' },
  { merchant: 'חנות אלקטרוניקה', amount: '₪2,100', time: 'לפני 8 דק׳' },
];

// Simple cycle: show transactions → vibrate phone → fade all out → repeat
function TransactionOverlay() {
  const [visible, setVisible] = useState(false);
  const [shaking, setShaking] = useState(false);
  const { language } = useLanguage();
  const he = language === 'he';

  useEffect(() => {
    let mounted = true;

    function cycle() {
      if (!mounted) return;
      // 1. Show all transactions (fade in)
      setVisible(true);

      // 2. After 800ms, vibrate the phone
      setTimeout(() => {
        if (!mounted) return;
        setShaking(true);
        setTimeout(() => setShaking(false), 400);
      }, 800);

      // 3. After 3.5s, fade out all transactions
      setTimeout(() => {
        if (!mounted) return;
        setVisible(false);
      }, 3500);

      // 4. After 4.5s (1s pause), restart cycle
      setTimeout(() => {
        if (!mounted) return;
        cycle();
      }, 4500);
    }

    // Start first cycle after a small delay
    const t = setTimeout(cycle, 500);
    return () => { mounted = false; clearTimeout(t); };
  }, []);

  const transactions = he ? CLEARING_TRANSACTIONS_HE : CLEARING_TRANSACTIONS_EN;
  const txItems = transactions.slice(0, 3);

  return (
    <>
      {shaking && (
        <style>{`
          .payments-hero-anim .payment-phone {
            animation: phoneVibrate 0.4s ease-out !important;
          }
        `}</style>
      )}
      <div className="absolute bottom-12 right-[-190px] z-30 flex flex-col-reverse gap-2 pointer-events-none"
           style={{ width: '210px' }}>
        {txItems.map((tx, i) => (
          <div
            key={i}
            className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/80 px-3 py-2.5 flex items-center gap-2.5"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.95)',
              transition: `opacity ${visible ? '0.4s' : '0.5s'} ease, transform ${visible ? '0.4s' : '0.5s'} ease`,
              transitionDelay: visible ? `${i * 120}ms` : `${(2 - i) * 80}ms`,
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center flex-shrink-0">
              <span className="text-green-500 text-xs font-bold">₪</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-900 truncate">{tx.merchant}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-slate-400">{tx.time}</span>
                <span className="text-[11px] font-black text-green-600">{tx.amount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes phoneVibrate {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-2px) rotate(-0.5deg); }
          30% { transform: translateX(2px) rotate(0.5deg); }
          45% { transform: translateX(-1.5px) rotate(-0.3deg); }
          60% { transform: translateX(1.5px) rotate(0.3deg); }
          75% { transform: translateX(-0.5px); }
        }
      `}</style>
    </>
  );
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
// Reversed order: start from 0.7% (best rate visible first), user can slide to see higher rates
const MILESTONES = [
  { pct: '0.7%', labelHe: 'מעל ₪10M',    labelEn: 'Above ₪10M/mo' },
  { pct: '0.8%', labelHe: 'עד ₪5M',      labelEn: 'Up to ₪5M/mo'  },
  { pct: '0.9%', labelHe: 'עד ₪1M',      labelEn: 'Up to ₪1M/mo'  },
  { pct: '1.2%', labelHe: '',             labelEn: ''               },
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
            {he ? 'עמלת סליקה גמישה בהתאם לגודל שלך' : 'Flexible Processing Fees That Scale With You'}
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm leading-relaxed">
            {he ? 'ככל שנפח הסליקה החודשי שלכם גדל — העמלה יורדת. גררו את המחוון כדי לראות את העמלה שלכם.' : 'The more you process, the lower your rate. Drag the slider to see your rate.'}
          </p>
        </div>

        {/* Current rate display */}
        <div className="text-center mb-12">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">
            {he ? 'העמלה שלך' : 'Your rate'}
          </span>
          <span className="text-8xl font-black text-stripe-purple transition-all duration-300 tabular-nums">
            {MILESTONES[activeIdx].pct}
          </span>
        </div>

        {/* Progress bar — always LTR so slider behaves correctly */}
        <div className="relative mb-20" dir="ltr">
          {/* Track background */}
          <div className="relative h-2 bg-slate-200 rounded-full mx-8">
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
                    <span className={`text-base font-black tabular-nums transition-colors duration-300 ${reached ? 'text-stripe-purple' : 'text-slate-300'}`}>
                      {m.pct}
                    </span>
                  </div>
                  {/* volume label below */}
                  <div className="absolute top-9 left-1/2 -translate-x-1/2 text-center whitespace-nowrap" dir={he ? 'rtl' : 'ltr'}>
                    <span className={`text-[11px] font-semibold transition-colors duration-300 ${reached ? 'text-slate-600' : 'text-slate-400'}`}>
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
            className="absolute inset-x-8 top-0 h-2 w-[calc(100%-4rem)] opacity-0 cursor-pointer"
            style={{ margin: 0 }}
          />
        </div>

        {/* CTAs */}
        <div className="flex flex-col items-center gap-4 mt-4">
          <div className="flex flex-wrap justify-center gap-4">
            <Link to={signupLink} className="inline-flex items-center gap-2 bg-stripe-purple text-white font-semibold px-10 py-3 rounded-xl hover:bg-violet-500 transition-colors">
              {he ? 'התחילו עכשיו' : 'Get Started'}
            </Link>
            <Link to={signupLink} className="inline-flex items-center gap-2 border-2 border-stripe-purple text-stripe-purple font-semibold px-10 py-3 rounded-xl hover:bg-stripe-purple/5 transition-colors">
              {he ? 'הצעה מותאמת' : 'Custom Quote'}
            </Link>
          </div>

          {/* Instant account opening emphasis */}
          <div className="flex items-center gap-2 mt-3">
            <Zap size={14} className="text-amber-500" />
            <span className="text-sm text-slate-500">
              {he ? 'פתחו חשבון סליקה מיד בדאשבורד — ללא נציג, ללא המתנה.' : 'Open a payments account instantly in the dashboard — no agent, no waiting.'}
            </span>
          </div>
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

      {/* Override payment-stage: no background, no frame — phone only */}
      <style>{`
        .payments-hero-anim { pointer-events: none; }
        .payments-hero-anim .payment-stage {
          overflow: visible !important; background: none !important; border: none !important;
          box-shadow: none !important; outline: none !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          padding: 0 !important;
        }
        .payments-hero-anim .payment-stage::before {
          display: none !important; content: none !important;
        }
        .payments-hero-anim .payment-phone,
        [dir="rtl"] .payments-hero-anim .payment-phone {
          position: relative !important; left: auto !important; right: auto !important;
          top: auto !important; margin: 0 auto !important;
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════
          HERO — light gray background matching home page
      ══════════════════════════════════════════════════════════ */}
      <div className="relative pb-[60px]">
        {/* Hero section bg */}
        <section className="relative pt-32 pb-20 bg-slate-50">
          {/* Hero content — z-20 so it sits ABOVE the diagonal */}
          <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6">

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

              {/* ── Animation column — phone + transaction overlay ── */}
              <div className="payments-hero-anim relative h-[520px] hidden lg:block">
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="relative">
                    <PaymentAnimation show="phone" />
                    <TransactionOverlay />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ── Gradient diagonal — above S2, below hero content ── */}
        <div className="absolute bottom-0 left-0 right-0 z-10 h-[180px]">
          <AnimatedGradient clipPath="polygon(0 30%, 100% 0%, 100% 70%, 0 100%)" />
          <div className="absolute inset-0 pointer-events-none" style={{
            clipPath: 'polygon(0 30%, 100% 0%, 100% 70%, 0 100%)',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(0,0,0,0.18) 100%)'
          }} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          S2 — קבלו תשלומים מכל מקום  +  דף מסלולי תשלום
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative z-0 py-20 md:py-32 bg-white overflow-x-hidden">
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
                  <BorderHighlightCard key={pm.alt} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center gap-2 hover:shadow-md hover:border-stripe-purple/30 transition-all duration-300">
                    <img src={pm.src} alt={pm.alt} className="h-8 object-contain" />
                    <span className="text-xs text-slate-500 font-medium">{pm.label}</span>
                  </BorderHighlightCard>
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
        {/* Blue diagonal bg — clipped top and bottom */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #0A2540 0%, #1a1f5e 60%, #0A2540 100%)',
            clipPath: 'polygon(0 80px, 100% 0, 100% calc(100% - 80px), 0 100%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

            <div className="text-right">
              <p className={`text-violet-300 font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2 ${isRtl ? '' : 'flex-row-reverse'}`}>
                <Link2 size={14} />
                {he ? 'קישורי תשלום' : 'Payment Links'}
              </p>
              <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight mb-6 leading-tight">
                {he ? 'קישורי תשלום ו-Checkout' : 'Payment Links & Checkout'}
              </h2>
              <p className="text-lg text-white/70 leading-relaxed mb-8">
                {he
                  ? 'שלחו ללקוח קישור – וקבלו תשלום מיד.'
                  : 'Send a link to your customer – and get paid immediately.'}
              </p>
              <ul className="space-y-4">
                {(he
                  ? ['Payment Links', 'עמודי Checkout מוכנים', 'גבייה מהירה ללא פיתוח']
                  : ['Payment Links', 'Ready-made Checkout pages', 'Fast collection without development']
                ).map((item) => (
                  <li key={item} className={`flex items-start gap-3 ${isRtl ? '' : 'flex-row-reverse'}`}>
                    <span className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center">
                      <Check size={12} className="text-violet-300" />
                    </span>
                    <span className="text-white/90">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Checkout panel ── */}
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
      <section className="scroll-reveal relative py-20 md:py-32 overflow-x-hidden">
        {/* Diagonal dark bg — clipped top and bottom */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #0A2540 0%, #1a1f5e 60%, #0A2540 100%)',
            clipPath: 'polygon(0 80px, 100% 0, 100% calc(100% - 80px), 0 100%)',
          }}
        />
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
      <section className="scroll-reveal relative py-24 overflow-hidden bg-white">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            {he ? 'התחילו לסלוק עם Nexus' : 'Start accepting payments with Nexus'}
          </h2>
          <p className="text-slate-600 text-lg mb-14 leading-relaxed max-w-2xl mx-auto">
            {he
              ? 'הצטרפו לעסקים שכבר משתמשים במערכת התשלומים של Nexus כדי לנהל את התשלומים שלהם ולהגדיל את הפעילות העסקית.'
              : 'Join businesses already using Nexus payments to manage their payments and grow their business.'}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              to={signupLink}
              className="inline-block bg-stripe-purple text-white font-semibold px-10 py-3 rounded-xl hover:bg-violet-500 transition-colors"
            >
              {he ? 'פתחו חשבון סליקה' : 'Open a payments account'}
            </Link>
            <Link
              to={signupLink}
              className="inline-block border-2 border-stripe-purple text-stripe-purple font-semibold px-10 py-3 rounded-xl hover:bg-stripe-purple/5 transition-colors"
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
