import { useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Check, CreditCard, Link2, RefreshCw, Users, Landmark, LayoutDashboard } from 'lucide-react';
import Navbar from '../components/Navbar';
import PaymentAnimation from '../components/PaymentAnimation';
import AnimatedGradient from '../components/AnimatedGradient';
import { useLanguage } from '../i18n/LanguageContext';

const Footer = lazy(() => import('../components/Footer'));

// ─── scroll-reveal observer (same pattern as HomeContent.tsx) ──
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          observer.unobserve(e.target);
        }
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.scroll-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Reusable bullet row ───────────────────────────────────────
function Bullet({ text, icon: Icon = Check }: { text: string; icon?: React.ElementType }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-stripe-purple/10 flex items-center justify-center">
        <Icon size={12} className="text-stripe-purple" />
      </span>
      <span className="text-slate-600">{text}</span>
    </li>
  );
}

// ─── Checkmark row (dark-section variant) ─────────────────────
function CheckRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <Check size={20} className="text-violet-400 flex-shrink-0" />
      <span className="text-white/90 text-lg">{text}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────
export default function PaymentsPage() {
  const { language, direction } = useLanguage();
  useScrollReveal();

  const he = language === 'he';
  const signupLink = he ? '/he/signup' : '/signup';
  const isRtl = direction === 'rtl';

  return (
    <div dir={direction} className="min-h-screen bg-white">
      <Navbar />

      {/* ══════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════ */}
      <section
        className="relative pt-32 pb-20 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0A2540 0%, #1a1f5e 60%, #0A2540 100%)' }}
      >
        {/* Soft glow blob */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #635BFF 0%, transparent 70%)' }}
        />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* ── Text column (DOM first → right in RTL, left in LTR) ── */}
            <div className={isRtl ? 'text-right' : 'text-left'}>
              {/* Label chip */}
              <div className={`inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium mb-6 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <CreditCard size={13} />
                <span>{he ? 'סליקה' : 'Payments'}</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                {he ? 'סליקה חכמה לעסקים' : 'Smart Payments for Business'}
              </h1>

              <p className="text-lg text-white/80 mb-4 leading-relaxed">
                {he
                  ? 'קבלו תשלומים מכל מקום – באתר, בלינקים, במנויים או בתוך קהילות Nexus.'
                  : 'Accept payments from anywhere – on your website, via links, subscriptions, or within Nexus communities.'}
              </p>
              <p className="text-lg text-white/70 mb-8 leading-relaxed">
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
                  <li key={item} className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <Check size={16} className="text-violet-400 flex-shrink-0" />
                    <span className="text-white/85">{item}</span>
                  </li>
                ))}
              </ul>

              {/* CTA buttons */}
              <div className={`flex flex-wrap gap-4 ${isRtl ? 'justify-end' : 'justify-start'}`}>
                <Link
                  to={signupLink}
                  className="inline-block bg-stripe-purple text-white font-semibold px-8 py-3 rounded-xl hover:bg-violet-500 transition-colors"
                >
                  {he ? 'פתחו חשבון סליקה' : 'Open a payments account'}
                </Link>
                <Link
                  to={signupLink}
                  className="inline-block border border-white/30 bg-white/10 text-white font-semibold px-8 py-3 rounded-xl hover:bg-white/20 transition-colors"
                >
                  {he ? 'קבעו שיחת היכרות' : 'Schedule a call'}
                </Link>
              </div>
            </div>

            {/* ── Animation column (DOM second → left in RTL, right in LTR) ── */}
            <div className="relative h-[480px] flex items-center justify-center overflow-hidden">
              <PaymentAnimation />
            </div>

          </div>
        </div>
      </section>

      {/* ── Animated gradient divider ──────────────────────────── */}
      <div className="relative h-40 overflow-hidden -mt-1">
        <AnimatedGradient
          clipPath={
            isRtl
              ? 'polygon(0 0, 100% 60%, 100% 100%, 0 100%)'
              : 'polygon(0 60%, 100% 0, 100% 100%, 0 100%)'
          }
        />
      </div>

      {/* ══════════════════════════════════════════════════════════
          S2 — קבלו תשלומים מכל מקום
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-white overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {(he
              ? ['כרטיסי אשראי', 'Apple Pay ו-Google Pay', 'Bit ו-PayPal', 'חיוב חשבון בנק', 'תשלומים בינלאומיים']
              : ['Credit cards', 'Apple Pay & Google Pay', 'Bit & PayPal', 'Bank account debit', 'International payments']
            ).map((item) => (
              <div key={item} className={`flex items-center gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <Check size={16} className="text-stripe-purple flex-shrink-0" />
                <span className="text-slate-700 font-medium">{item}</span>
              </div>
            ))}
          </div>

          <p className="text-slate-500">
            {he
              ? 'התחילו לגבות תשלומים באתר שלכם, במובייל או דרך קישורי תשלום.'
              : 'Start accepting payments on your website, mobile, or via payment links.'}
          </p>
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

            <div>
              <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
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

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 mt-8 lg:mt-16">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5">
                {he ? 'פתרון מושלם עבור:' : 'Perfect for:'}
              </p>
              <ul className="space-y-5">
                {(he
                  ? ['שירותים מקצועיים', 'מכירת מוצרים', 'גבייה מהירה מלקוחות']
                  : ['Professional services', 'Product sales', 'Quick client billing']
                ).map((item) => (
                  <li key={item} className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className="w-2 h-2 rounded-full bg-stripe-purple flex-shrink-0" />
                    <span className="text-slate-700 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
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

            <div>
              <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
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

            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-8 mt-8 lg:mt-16">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5">
                {he ? 'מתאים במיוחד עבור:' : 'Ideal for:'}
              </p>
              <ul className="space-y-5">
                {(he
                  ? ['תוכניות שירות', 'קורסים', 'מועדוני לקוחות']
                  : ['Service plans', 'Courses', 'Customer loyalty clubs']
                ).map((item) => (
                  <li key={item} className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className="w-2 h-2 rounded-full bg-stripe-purple flex-shrink-0" />
                    <span className="text-slate-700 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          S5 — הבידול שלנו (dark)
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
          <div className="max-w-3xl">
            <p className="text-violet-300 font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
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
          S6 — שירותים פיננסיים
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 overflow-x-hidden">
        <div
          className="absolute inset-0 bg-slate-50"
          style={{
            clipPath: isRtl
              ? 'polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 80px))'
              : 'polygon(0 0, 100% 0, 100% calc(100% - 80px), 0 100%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <Landmark size={14} />
              {he ? 'פיננסים' : 'Finance'}
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-6 leading-tight">
              {he ? 'שירותים פיננסיים לעסקים' : 'Financial Services for Business'}
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed mb-8">
              {he
                ? 'מעבר לסליקה, Nexus מאפשרת גם גישה לפתרונות פיננסיים מתקדמים.'
                : 'Beyond payments, Nexus also gives you access to advanced financial solutions.'}
            </p>
            <ul className="space-y-4 mb-8">
              {(he
                ? ['זיכוי מהיר לכספי סליקה', 'ניכיון עסקאות', 'פתרונות מימון לעסקים']
                : ['Fast credit of payment funds', 'Invoice discounting', 'Business financing solutions']
              ).map((item) => <Bullet key={item} text={item} icon={Landmark} />)}
            </ul>
            <p className="text-slate-500">
              {he
                ? 'כלים שמאפשרים לעסק לצמוח בצורה יציבה.'
                : 'Tools that enable your business to grow steadily.'}
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          S7 — מערכת אחת
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-white overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-stripe-purple font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <LayoutDashboard size={14} />
              {he ? 'ניהול' : 'Management'}
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-10 leading-tight">
              {he ? 'מערכת אחת לניהול כל התשלומים' : 'One system to manage all payments'}
            </h2>
            <div className="space-y-5">
              {(he
                ? ['ניהול עסקאות במקום אחד', 'ממשק פשוט וברור', 'אבטחת מידע מתקדמת']
                : ['Manage transactions in one place', 'Simple and clear interface', 'Advanced data security']
              ).map((item) => (
                <div key={item} className={`flex items-center gap-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <span className="w-8 h-8 rounded-full bg-stripe-purple/10 flex items-center justify-center flex-shrink-0">
                    <Check size={16} className="text-stripe-purple" />
                  </span>
                  <span className="text-xl font-semibold text-slate-800">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════════════ */}
      <section className="scroll-reveal relative py-24 overflow-hidden bg-gradient-to-br from-stripe-blue to-violet-900 text-white text-center">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-15 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)' }}
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {he ? 'התחילו לסלוק עם Nexus' : 'Start accepting payments with Nexus'}
          </h2>
          <p className="text-white/70 text-lg mb-10 leading-relaxed">
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
