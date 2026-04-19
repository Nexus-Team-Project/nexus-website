import { useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Check, Users, TrendingUp, Shield, Heart } from 'lucide-react';
import Navbar from '../components/Navbar';
import AnimatedGradient from '../components/AnimatedGradient';
import BenefitsPhoneMockup from '../components/benefits/BenefitsPhoneMockup';
import BenefitsProviderGrid from '../components/benefits/BenefitsProviderGrid';
import BenefitsFeatureGrid from '../components/benefits/BenefitsFeatureGrid';
import BenefitsHowItWorks from '../components/benefits/BenefitsHowItWorks';
import BenefitsStats from '../components/benefits/BenefitsStats';
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
      <span className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-nx-primary/10 flex items-center justify-center">
        <Icon size={12} className="text-nx-primary" />
      </span>
      <span className="text-slate-600">{text}</span>
    </li>
  );
}

// ─── Challenge illustration — animated disconnecting nodes ──
function ChallengeIllustration() {
  return (
    <div className="relative w-full max-w-md mx-auto" style={{ height: 320 }}>
      {/* Center org node */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-slate-200 border-2 border-slate-300 flex items-center justify-center z-10">
        <Shield size={24} className="text-slate-400" />
      </div>

      {/* Orbiting member nodes — fade-in/out cycle */}
      {[
        { top: '10%', left: '20%', delay: '0s',   icon: Users },
        { top: '10%', left: '70%', delay: '0.5s', icon: Heart },
        { top: '50%', left: '5%',  delay: '1s',   icon: TrendingUp },
        { top: '50%', left: '85%', delay: '1.5s', icon: Users },
        { top: '80%', left: '25%', delay: '2s',   icon: Heart },
        { top: '80%', left: '65%', delay: '0.3s', icon: TrendingUp },
      ].map((node, i) => (
        <div
          key={i}
          className="absolute w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center"
          style={{
            top: node.top,
            left: node.left,
            animation: `challengeNodePulse 3s ease-in-out ${node.delay} infinite`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          }}
        >
          <node.icon size={16} className="text-slate-400" />
        </div>
      ))}

      {/* Dashed connecting lines (SVG) */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
        {[
          { x1: '50%', y1: '50%', x2: '22%', y2: '15%' },
          { x1: '50%', y1: '50%', x2: '72%', y2: '15%' },
          { x1: '50%', y1: '50%', x2: '8%',  y2: '55%' },
          { x1: '50%', y1: '50%', x2: '88%', y2: '55%' },
          { x1: '50%', y1: '50%', x2: '28%', y2: '85%' },
          { x1: '50%', y1: '50%', x2: '68%', y2: '85%' },
        ].map((line, i) => (
          <line
            key={i}
            x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
            stroke="#cbd5e1"
            strokeWidth="1"
            strokeDasharray="4 4"
            style={{ animation: `challengeLineFade 3s ease-in-out ${i * 0.3}s infinite` }}
          />
        ))}
      </svg>

      <style>{`
        @keyframes challengeNodePulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50%      { opacity: 1;   transform: scale(1); }
        }
        @keyframes challengeLineFade {
          0%, 100% { opacity: 0.2; }
          50%      { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

export default function BenefitsPageV1() {
  const { language, direction } = useLanguage();
  const he = language === 'he';
  const isRtl = direction === 'rtl';
  const signupLink = he ? '/he/signup' : '/signup';

  useScrollReveal();

  return (
    <div dir={direction} className="min-h-screen bg-white overflow-x-hidden">
      <Navbar variant="dark" />

      {/* ═══════════════════════ S1: HERO ═══════════════════════ */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-slate-50 overflow-hidden">
        {/* Diagonal gradient background */}
        <AnimatedGradient />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Text column */}
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <p className="text-nx-primary font-semibold text-sm uppercase tracking-wider mb-4">
                {he ? 'מועדון הטבות ארגוני' : 'Corporate Benefits Club'}
              </p>
              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                {he
                  ? 'העצימו את הקהילה שלכם דרך ערך אמיתי'
                  : 'Empower Your Community Through Real Value'}
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
                <Bullet text={he ? 'הטבות לאורך כל השנה — לא רק חגים' : 'Year-round benefits — not just holidays'} />
              </ul>
              <div className={`flex flex-wrap gap-4 ${isRtl ? '' : 'flex-row-reverse'}`}>
                <Link
                  to={signupLink}
                  className="inline-flex items-center gap-2 bg-nx-primary text-white px-7 py-3.5 rounded-full font-semibold text-sm hover:bg-[#5649d8] transition-all shadow-lg shadow-nx-primary/25 hover:shadow-xl hover:shadow-nx-primary/30"
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

            {/* Phone mockup column */}
            <div className="flex justify-center lg:justify-end">
              <BenefitsPhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S2: THE CHALLENGE ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-white overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Visual */}
            <div className={`order-2 ${isRtl ? 'lg:order-2' : 'lg:order-1'}`}>
              <ChallengeIllustration />
            </div>

            {/* Text */}
            <div className={`order-1 ${isRtl ? 'lg:order-1 text-right' : 'lg:order-2 text-left'}`}>
              <p className="text-nx-primary font-semibold text-sm uppercase tracking-wider mb-4">
                {he ? 'האתגר' : 'The Challenge'}
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-6">
                {he ? 'איך שומרים על קהילה פעילה ומחוברת?' : 'How Do You Keep a Community Engaged?'}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                {he
                  ? 'ארגונים משקיעים מיליונים בגיוס חברים, עובדים, לקוחות, תורמים ואוהדים. אבל בלי ערך יומיומי אמיתי — הקשר נחלש. הלחץ הכלכלי היומיומי הוא נקודת הכאב הגדולה ביותר של חברי הקהילה.'
                  : 'Organizations invest millions in acquiring members, employees, customers, donors, and fans. But without daily real value — the connection weakens. Daily economic pressure is the biggest pain point for community members.'}
              </p>
              <p className="text-lg text-slate-600 leading-relaxed">
                {he
                  ? 'חיסכון סביב כלכלה יומיומית פותר כאב בכיס — ויוצר חיבור עמוק עם הארגון. וזה מה שמייצר ומשמר את המשאב שנקרא קהילה.'
                  : 'Savings around daily economics solves a real financial pain — and creates a deep connection with the organization. That\'s what builds and preserves the resource called community.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S3: THE SOLUTION ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-slate-50 overflow-x-hidden">
        {/* Diagonal top */}
        <div className="absolute inset-0" style={{
          clipPath: isRtl
            ? 'polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 60px))'
            : 'polygon(0 0, 100% 0, 100% calc(100% - 60px), 0 100%)',
          background: '#f8fafc',
          zIndex: 0,
        }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Text */}
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <p className="text-nx-primary font-semibold text-sm uppercase tracking-wider mb-4">
                {he ? 'הפתרון' : 'The Solution'}
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-6">
                {he
                  ? 'מועדון הטבות ארגוני שיוצר חיבור דרך חיסכון'
                  : 'A Benefits Club That Connects Through Savings'}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                {he
                  ? 'פלטפורמת White-Label מוכנה להפעלה תחת המיתוג שלכם. מאות הטבות ארציות לצד הטבות ייחודיות של הארגון, חוויית משתמש מתקדמת, ומערכת ניהול שנותנת לכם שליטה מלאה.'
                  : 'A White-Label platform ready to launch under your brand. Hundreds of national benefits alongside your own org-specific perks, a premium user experience, and a management system that gives you full control.'}
              </p>
              <ul className={`space-y-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                <Bullet text={he ? 'פלטפורמה ממותגת בשם ובצבעי הארגון' : 'Platform branded with your org\'s name & colors'} />
                <Bullet text={he ? 'חוויית אפליקציה חכמה ונוחה' : 'Smart, seamless app experience'} />
                <Bullet text={he ? 'הטבות שמתעדכנות באופן שוטף' : 'Benefits updated continuously'} />
                <Bullet text={he ? 'בסיס לבניית מודלים עסקיים נוספים' : 'Foundation for additional business models'} />
              </ul>
            </div>

            {/* Branded phone mockup */}
            <div className="flex justify-center">
              <BenefitsPhoneMockup
                variant="branded"
                orgName={he ? 'הארגון שלך' : 'Your Org'}
                orgColor="#059669"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ S4: PROVIDERS ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-white overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="inline-block bg-nx-primary/10 text-nx-primary text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
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

      {/* ═══════════════════════ S5: PLATFORM FEATURES ═══════════════════════ */}
      <section className="scroll-reveal relative py-20 md:py-32 bg-slate-50 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="inline-block bg-nx-primary/10 text-nx-primary text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
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
        {/* Decorative blob */}
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
      <section className="scroll-reveal relative py-20 md:py-28 bg-nx-light overflow-x-hidden">
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
        {/* Decorative blobs */}
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
              className="inline-flex items-center gap-2 bg-nx-primary text-white px-8 py-4 rounded-full font-semibold text-base hover:bg-[#5649d8] transition-all shadow-lg shadow-nx-primary/30 hover:shadow-xl hover:shadow-nx-primary/40"
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
      <Suspense fallback={<div className="h-64 bg-nx-blue" />}>
        <Footer />
      </Suspense>
    </div>
  );
}
