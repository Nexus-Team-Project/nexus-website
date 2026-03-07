import { useEffect, lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CreditCard, Link2, RefreshCw, Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import PaymentAnimation, { PaymentPricingPanel, PaymentCheckoutPanel } from '../components/PaymentAnimation';
import AnimatedGradient from '../components/AnimatedGradient';
import { useLanguage } from '../i18n/LanguageContext';
import visaLogo from '../assets/logos/visa-logo.png';
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
function PricingCalculatorSection({ he, isRtl, signupLink }: { he: boolean; isRtl: boolean; signupLink: string }) {
  const [volume, setVolume] = useState(50000);
  const [avgOrder, setAvgOrder] = useState(200);
  const [plan, setPlan] = useState<1 | 2>(1);

  function getRate(v: number) {
    if (v > 5_000_000) return 0.0068;
    if (v > 1_000_000) return 0.008;
    return 0.009;
  }

  function getTier(v: number) {
    if (v > 5_000_000) return he ? 'פרימיום 0.68%' : 'Premium 0.68%';
    if (v > 1_000_000) return he ? 'נפח גבוה 0.8%' : 'High Volume 0.8%';
    return he ? 'בסיס 0.9%' : 'Base 0.9%';
  }

  const numTx = Math.max(1, Math.round(volume / avgOrder));
  const rate = getRate(volume);

  const plan1Fee = volume * 0.009 + numTx * 1;
  const plan2Fee = volume * 0.0085 + 49;
  const activeFee = plan === 1 ? plan1Fee : plan2Fee;
  const activePercent = plan === 1 ? volume * 0.009 : volume * 0.0085;

  const maxBar = Math.max(plan1Fee, plan2Fee);
  const cheaper = plan1Fee < plan2Fee ? 1 : 2;
  const saving = Math.abs(plan1Fee - plan2Fee);

  const fmt = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL');

  const volumeTiers = he
    ? [
        { pct: '0.9%', title: 'עמלת בסיס', sub: 'עד מיליון ₪ בחודש', note: 'השותף קובע את עמלת הסליקה לכל עסק תחתיו' },
        { pct: '0.8%', title: 'נפח גבוה', sub: 'מעל מיליון ₪ בחודש', note: 'חיסכון של 0.1% מעל המיליון', popular: true },
        { pct: '0.68%', title: 'נפח פרימיום', sub: 'מעל 5 מיליון ₪ בחודש', note: 'העמלה הנמוכה ביותר' },
      ]
    : [
        { pct: '0.9%', title: 'Base Rate', sub: 'Up to ₪1M / month', note: 'Partner sets the merchant rate' },
        { pct: '0.8%', title: 'High Volume', sub: 'Over ₪1M / month', note: 'Save 0.1% above ₪1M', popular: true },
        { pct: '0.68%', title: 'Premium', sub: 'Over ₪5M / month', note: 'Lowest available rate' },
      ];

  return (
    <section className="scroll-reveal relative py-20 md:py-32 bg-slate-50 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block bg-stripe-purple/10 text-stripe-purple text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
            {he ? 'תמחור' : 'Pricing'}
          </span>
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            {he ? 'עמלת סליקה לעסקים בישראל' : 'Processing Fees for Israeli Businesses'}
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm">
            {he
              ? 'עבור כרטיסים ישראלים ממותגי ויזה, מאסטרקארד וישראכרט. ההפרש בין עמלת הבסיס לעמלה שהעסק ישלם — מועבר לשותף.'
              : 'For Israeli-branded Visa, Mastercard and Isracard. The difference between the base rate and what the merchant pays goes to the partner.'}
          </p>
        </div>

        {/* Volume Tier Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {volumeTiers.map((t) => (
            <div
              key={t.pct}
              className={`relative bg-white rounded-2xl p-7 border shadow-sm text-right ${t.popular ? 'border-stripe-purple/40 ring-1 ring-stripe-purple/20' : 'border-slate-200'}`}
            >
              {t.popular && (
                <div className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'}`}>
                  <span className="bg-stripe-purple/10 text-stripe-purple text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full">
                    {he ? 'פופולרי' : 'Popular'}
                  </span>
                </div>
              )}
              <div className="text-4xl font-black text-stripe-purple mb-1">{t.pct}</div>
              <div className="font-bold text-slate-900 mb-1">{t.title}</div>
              <div className="text-sm text-slate-500 mb-4">{t.sub}</div>
              <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">{t.note}</div>
            </div>
          ))}
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {/* Plan 1 */}
          <div className="bg-white rounded-2xl p-7 border border-slate-200 shadow-sm text-right">
            <div className={`flex items-center justify-between mb-5 ${isRtl ? '' : 'flex-row-reverse'}`}>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">
                {he ? 'מסלול 1' : 'Plan 1'}
              </span>
              <h4 className="font-bold text-slate-900">{he ? 'לא סלקת, לא שילמת' : 'Pay Per Use'}</h4>
            </div>
            <div className={`flex items-end gap-2 mb-3 ${isRtl ? '' : 'flex-row-reverse'}`}>
              <span className="text-3xl font-black text-stripe-purple">0.9%</span>
              <span className="text-slate-500 text-sm mb-1">{he ? '+ ₪1 לעסקה' : '+ ₪1 / transaction'}</span>
            </div>
            <p className="text-sm text-slate-500">{he ? 'תשלום רק על עסקאות שבוצעו. ללא עמלה חודשית קבועה.' : 'Pay only for completed transactions. No monthly fee.'}</p>
          </div>
          {/* Plan 2 */}
          <div className="bg-slate-900 rounded-2xl p-7 border border-slate-800 shadow-xl text-right">
            <div className={`flex items-center justify-between mb-5 ${isRtl ? '' : 'flex-row-reverse'}`}>
              <span className="bg-stripe-purple/20 text-stripe-purple text-xs font-bold px-3 py-1 rounded-full">
                {he ? 'מסלול 2' : 'Plan 2'}
              </span>
              <h4 className="font-bold text-white">{he ? 'עמלה חודשית קבועה' : 'Monthly Fixed Fee'}</h4>
            </div>
            <div className={`flex items-end gap-2 mb-3 ${isRtl ? '' : 'flex-row-reverse'}`}>
              <span className="text-3xl font-black text-stripe-purple">0.85%</span>
              <span className="text-slate-400 text-sm mb-1">{he ? '+ ₪49/חודש' : '+ ₪49/month'}</span>
            </div>
            <p className="text-sm text-slate-400">{he ? 'עמלה מופחתת + תשלום חודשי. ללא תוספת שקל לעסקה.' : 'Lower % + flat monthly fee. No per-transaction charge.'}</p>
          </div>
        </div>

        {/* ── Interactive Calculator ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-stripe-purple/5 to-transparent p-8 border-b border-slate-200">
            <div className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div className="size-12 bg-stripe-purple/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-stripe-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
                </svg>
              </div>
              <div className={isRtl ? 'text-right' : 'text-left'}>
                <h3 className="text-xl font-bold text-slate-900">{he ? 'מחשבון עמלת סליקה' : 'Fee Calculator'}</h3>
                <p className="text-sm text-slate-500">{he ? 'חשב את העמלה החודשית שלך לפי נפח ומסלול' : 'Calculate your monthly fee by volume and plan'}</p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="grid lg:grid-cols-2 gap-10">

              {/* Inputs */}
              <div className="space-y-8">

                {/* Volume slider */}
                <div className="space-y-3">
                  <div className={`flex justify-between items-center ${isRtl ? '' : 'flex-row-reverse'}`}>
                    <span className="text-2xl font-black text-stripe-purple">{fmt(volume)}</span>
                    <label className="text-sm font-semibold text-slate-700">{he ? 'נפח סליקה חודשי' : 'Monthly Volume'}</label>
                  </div>
                  <input
                    type="range" min={5000} max={10_000_000} step={5000} value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-stripe-purple"
                  />
                  <div className={`flex justify-between text-xs text-slate-400 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <span>₪5,000</span><span>₪10M</span>
                  </div>
                </div>

                {/* Avg order (plan 1 only) */}
                {plan === 1 && (
                  <div className="space-y-3">
                    <div className={`flex justify-between items-center ${isRtl ? '' : 'flex-row-reverse'}`}>
                      <span className="text-2xl font-black text-stripe-purple">{fmt(avgOrder)}</span>
                      <label className="text-sm font-semibold text-slate-700">{he ? 'ערך עסקה ממוצע' : 'Avg. Order Value'}</label>
                    </div>
                    <input
                      type="range" min={10} max={5000} step={10} value={avgOrder}
                      onChange={(e) => setAvgOrder(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-stripe-purple"
                    />
                    <div className={`flex justify-between text-xs text-slate-400 ${isRtl ? 'flex-row-reverse' : ''}`}>
                      <span>₪10</span><span>₪5,000</span>
                    </div>
                  </div>
                )}

                {/* Plan selector */}
                <div>
                  <p className={`text-sm font-semibold text-slate-700 mb-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {he ? 'בחר מסלול' : 'Select plan'}
                  </p>
                  <div className={`flex gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    {([1, 2] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPlan(p)}
                        className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all text-right ${plan === p ? 'bg-stripe-purple text-white border-stripe-purple shadow-md' : 'border-slate-200 text-slate-700 hover:border-stripe-purple/40'}`}
                      >
                        <div className={`text-xs font-normal mb-0.5 ${plan === p ? 'opacity-70' : 'text-slate-400'}`}>
                          {p === 1 ? (he ? '0.9% + ₪1/עסקה' : '0.9% + ₪1/tx') : (he ? '0.85% + ₪49/חודש' : '0.85% + ₪49/mo')}
                        </div>
                        {p === 1 ? (he ? 'לא סלקת, לא שילמת' : 'Pay Per Use') : (he ? 'עמלה חודשית קבועה' : 'Monthly Fixed')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Results */}
              <div className="bg-slate-50 rounded-xl p-6 space-y-4 border border-slate-200">
                <div className={`flex justify-between items-center ${isRtl ? '' : 'flex-row-reverse'}`}>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{he ? 'פירוט חודשי' : 'Monthly Breakdown'}</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${volume > 5_000_000 ? 'bg-purple-100 text-purple-700' : volume > 1_000_000 ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    {getTier(volume)}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className={`flex justify-between items-center text-sm ${isRtl ? '' : 'flex-row-reverse'}`}>
                    <span className="font-bold text-slate-800">{fmt(activePercent)}</span>
                    <span className="text-slate-500">{he ? 'עמלה אחוזית' : '% fee'}</span>
                  </div>
                  {plan === 1 ? (
                    <div className={`flex justify-between items-center text-sm ${isRtl ? '' : 'flex-row-reverse'}`}>
                      <span className="font-bold text-slate-800">{fmt(numTx)}</span>
                      <span className="text-slate-500">{he ? `₪1 × ${numTx.toLocaleString('he-IL')} עסקאות` : `₪1 × ${numTx.toLocaleString()} tx`}</span>
                    </div>
                  ) : (
                    <div className={`flex justify-between items-center text-sm ${isRtl ? '' : 'flex-row-reverse'}`}>
                      <span className="font-bold text-slate-800">₪49</span>
                      <span className="text-slate-500">{he ? 'תשלום חודשי קבוע' : 'Monthly fixed fee'}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                    <span className="text-3xl font-black text-stripe-purple">{fmt(activeFee)}</span>
                    <span className={`text-sm font-semibold text-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}>
                      {he ? 'סה״כ לחודש' : 'Total / month'}
                    </span>
                  </div>
                  {plan === 1 && (
                    <p className="text-xs text-slate-400 bg-white rounded-lg p-2.5 border border-slate-200 text-right">
                      {he ? `מספר עסקאות משוער: ${numTx.toLocaleString('he-IL')}` : `Est. transactions: ${numTx.toLocaleString()}`}
                    </p>
                  )}
                </div>

                {/* Comparison bars */}
                <div className="pt-2 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 text-right">{he ? 'השוואת מסלולים' : 'Plan comparison'}</p>
                  {([1, 2] as const).map((p) => {
                    const fee = p === 1 ? plan1Fee : plan2Fee;
                    return (
                      <div key={p} className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <span className="text-xs text-slate-500 w-20 text-right shrink-0">{fmt(fee)}</span>
                        <div className="flex-1 h-5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${p === cheaper ? 'bg-stripe-purple' : 'bg-slate-400'}`}
                            style={{ width: `${(fee / maxBar) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-24 text-right shrink-0">
                          {p === 1 ? (he ? 'לא סלקת' : 'Pay/Use') : (he ? 'חודשי' : 'Monthly')}
                        </span>
                      </div>
                    );
                  })}
                  {saving > 5 && (
                    <p className="text-xs font-bold text-stripe-purple text-right">
                      {cheaper === 1
                        ? (he ? `מסלול "לא סלקת" חוסך ${fmt(saving)} בחודש` : `Pay-per-use saves you ${fmt(saving)}/month`)
                        : (he ? `מסלול חודשי חוסך ${fmt(saving)} בחודש` : `Monthly plan saves you ${fmt(saving)}/month`)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-10">
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
        /* Kill hover entirely — RTL hero autoplays, no need for hover triggers */
        .payments-hero-anim { pointer-events: none; }
        .payments-hero-anim .payment-stage {
          overflow: visible !important; background: none !important; border: none !important;
          box-shadow: none !important; outline: none !important;
        }
        .payments-hero-anim .payment-stage::before {
          display: none !important; content: none !important;
        }
        .payments-hero-anim .payment-phone { left: 80px !important; }
        [dir="rtl"] .payments-hero-anim .payment-phone { left: 60px !important; right: auto !important; top: 40px !important; }
        [dir="rtl"] .payments-hero-anim .payment-stage { height: 100%; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════
          HERO — light gray background matching home page
      ══════════════════════════════════════════════════════════ */}
      {/* Wrapper for hero + diagonal so phone animation can overlap both */}
      <div className="relative">
        {/* RTL: Phone floats above hero + diagonal strip */}
        {isRtl && (
          <div className="payments-hero-anim payment-card-expandable absolute left-16 top-32 w-[280px] hidden lg:block z-20" style={{ bottom: '-2rem' }}>
            <PaymentAnimation show="phone" />
          </div>
        )}

        <section className={`relative pt-32 bg-slate-50 overflow-x-hidden ${isRtl ? 'pb-12' : 'pb-20'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">

            <div className={`grid grid-cols-1 gap-12 items-center ${isRtl ? '' : 'lg:grid-cols-2'}`}>

              {/* ── Text column (DOM first → right in RTL, left in LTR) ── */}
              <div className={`text-right ${isRtl ? 'lg:pl-[300px]' : ''}`}>

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

              {/* ── LTR: Animation column — phone only, hover activates animations ── */}
              {!isRtl && (
                <div className="payments-hero-anim payment-card-expandable relative h-[520px]">
                  <PaymentAnimation show="phone" />
                </div>
              )}

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
                  { src: '/paybox-transparent.png', alt: 'PayBox', label: 'PayBox' },
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
