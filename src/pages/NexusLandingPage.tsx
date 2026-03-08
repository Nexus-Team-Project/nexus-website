import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, CheckCircle, Users, BarChart3, Zap, Gift, Shield, Calendar, Building2, Smartphone, Mail, Link as LinkIcon, TrendingUp, Star, Clock, Settings, Heart, Briefcase, Globe, ChevronDown } from 'lucide-react';
import NexusLogo from '../components/NexusLogo';
import AnimatedGradient from '../components/AnimatedGradient';
import { LanguageProvider } from '../i18n/LanguageContext';

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

// ─── Navbar ──────────────────────────────────────────────────────────────────
function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-100' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link to="/he" className="flex items-center">
            <NexusLogo height={28} variant={scrolled ? 'black' : 'white'} page="navbar" />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className={`text-sm font-semibold transition-colors ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>תכונות</a>
            <a href="#benefits" className={`text-sm font-semibold transition-colors ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>יתרונות</a>
            <a href="#use-cases" className={`text-sm font-semibold transition-colors ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>שימושים</a>
            <a href="#comparison" className={`text-sm font-semibold transition-colors ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>השוואה</a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="#cta-final"
            className="bg-stripe-purple hover:bg-stripe-purple/85 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-lg hover:shadow-stripe-purple/25"
          >
            קבעו פגישת הדגמה
          </a>
          <button
            className="md:hidden p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <div className={`w-5 h-0.5 ${scrolled ? 'bg-slate-900' : 'bg-white'} transition-all ${mobileOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
            <div className={`w-5 h-0.5 ${scrolled ? 'bg-slate-900' : 'bg-white'} mt-1 transition-all ${mobileOpen ? 'opacity-0' : ''}`} />
            <div className={`w-5 h-0.5 ${scrolled ? 'bg-slate-900' : 'bg-white'} mt-1 transition-all ${mobileOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 shadow-lg">
          <div className="px-6 py-4 space-y-3">
            <a href="#features" className="block text-sm font-semibold text-slate-700 py-2" onClick={() => setMobileOpen(false)}>תכונות</a>
            <a href="#benefits" className="block text-sm font-semibold text-slate-700 py-2" onClick={() => setMobileOpen(false)}>יתרונות</a>
            <a href="#use-cases" className="block text-sm font-semibold text-slate-700 py-2" onClick={() => setMobileOpen(false)}>שימושים</a>
            <a href="#comparison" className="block text-sm font-semibold text-slate-700 py-2" onClick={() => setMobileOpen(false)}>השוואה</a>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Section 1: Hero ─────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative min-h-[85vh] md:min-h-screen flex items-center overflow-hidden">
      <AnimatedGradient clipPath="polygon(0 0, 100% 0, 100% 100%, 0 65%)" />

      <div className="relative z-10 w-full">
        <div className="max-w-7xl mx-auto px-6 pt-32 pb-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Text content */}
            <div className="lg:order-1">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-8">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-white font-medium">חדש: אוטומציה מלאה לניהול רווחה</span>
                <ArrowLeft size={12} className="text-white/70" />
              </div>

              <h1 className="text-4xl lg:text-6xl font-bold text-white leading-[1.15] tracking-tight mb-6 drop-shadow-lg">
                ניהול תקציב רווחה
                <br />
                ומתנות לעובדים
                <br />
                <span className="text-yellow-200">במקום אחד</span>
              </h1>

              <p className="text-lg text-white/90 leading-relaxed max-w-xl mb-10 drop-shadow">
                פלטפורמה שמאפשרת לארגונים להקצות תקציבי רווחה, לשלוח מתנות לעובדים ולנהל הטבות בצורה פשוטה ושקופה.
              </p>

              <div className="flex flex-wrap gap-4">
                <a
                  href="#cta-final"
                  className="group inline-flex items-center gap-2 bg-stripe-purple hover:bg-stripe-purple/85 text-white font-semibold px-8 py-4 rounded-lg transition-all duration-300 hover:shadow-xl hover:shadow-stripe-purple/30 text-base"
                >
                  קבעו פגישת הדגמה
                  <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                    <ArrowLeft size={16} className="inline" />
                  </span>
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-semibold px-8 py-4 rounded-lg transition-all text-base"
                >
                  ראו איך זה עובד
                </a>
              </div>
            </div>

            {/* Dashboard mockup */}
            <div className="lg:order-2 hidden lg:block">
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-4 transform -rotate-1 hover:rotate-0 transition-transform duration-700">
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="h-10 bg-slate-50 border-b border-slate-100 flex items-center px-4 gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-300" />
                    <div className="w-3 h-3 rounded-full bg-yellow-300" />
                    <div className="w-3 h-3 rounded-full bg-green-300" />
                    <span className="mr-4 text-[10px] text-slate-400 font-mono">nexus.co.il/dashboard</span>
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">תקציב רווחה שנתי</div>
                        <div className="text-2xl font-bold text-slate-900">₪ 2,450,000</div>
                      </div>
                      <div className="h-10 w-10 bg-stripe-purple/10 rounded-full flex items-center justify-center">
                        <BarChart3 size={20} className="text-stripe-purple" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="bg-emerald-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-emerald-700">₪1.8M</div>
                        <div className="text-[10px] text-emerald-600">נוצל</div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-blue-700">₪650K</div>
                        <div className="text-[10px] text-blue-600">זמין</div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-purple-700">1,240</div>
                        <div className="text-[10px] text-purple-600">עובדים</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">מתנות חג</span>
                        <span className="text-slate-700 font-semibold">78%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-l from-stripe-purple to-purple-400 rounded-full" style={{ width: '78%' }} />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">ימי הולדת</span>
                        <span className="text-slate-700 font-semibold">92%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-l from-emerald-500 to-emerald-300 rounded-full" style={{ width: '92%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating notification */}
              <div className="absolute -bottom-4 right-8 bg-white rounded-xl shadow-xl p-4 border border-slate-100 w-64 transform rotate-2 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle size={20} className="text-green-600" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">המתנות נשלחו!</div>
                    <div className="text-[10px] text-slate-500">350 עובדים קיבלו מתנה לחג</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section 2: The Problem ─────────────────────────────────────────────────
function ProblemSection() {
  const problems = [
    {
      icon: <Settings size={24} className="text-red-500" />,
      title: 'ספקים מרובים ללא שליטה',
      desc: 'ניהול מתנות לעובדים מול עשרות ספקים שונים, ללא מערכת מרכזית למעקב ובקרה.',
    },
    {
      icon: <Clock size={24} className="text-orange-500" />,
      title: 'רכישות ידניות שגוזלות זמן',
      desc: 'רכישת שוברים באופן ידני, מעקב בגיליונות אקסל, וחוסר אוטומציה בתהליכים חוזרים.',
    },
    {
      icon: <BarChart3 size={24} className="text-yellow-600" />,
      title: 'חוסר שקיפות תקציבית',
      desc: 'קושי לעקוב אחרי תקציבי רווחה, ניצולם ויתרות – במיוחד בארגונים עם מספר רב של עובדים.',
    },
    {
      icon: <Heart size={24} className="text-pink-500" />,
      title: 'עובדים לא תמיד מרוצים',
      desc: 'שוברים אחידים לא מתאימים לכולם. עובדים רוצים בחירה, גמישות וחוויה אישית.',
    },
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="max-w-3xl mb-16">
            <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">הבעיה</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              ניהול רווחה בארגון לא אמור להיות מסובך
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              ארגונים רבים עדיין מנהלים תקציבי רווחה ומתנות לעובדים בשיטות מיושנות. התוצאה? בזבוז זמן, חוסר שקיפות ועובדים לא מרוצים.
            </p>
          </div>
        </FadeInSection>

        <div className="grid md:grid-cols-2 gap-6">
          {problems.map((problem, i) => (
            <FadeInSection key={i}>
              <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:shadow-lg transition-shadow duration-300">
                <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center mb-5">
                  {problem.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{problem.title}</h3>
                <p className="text-slate-600 leading-relaxed">{problem.desc}</p>
              </div>
            </FadeInSection>
          ))}
        </div>

        <FadeInSection>
          <div className="mt-12 text-center">
            <p className="text-xl font-semibold text-slate-700 bg-gradient-to-l from-stripe-purple/10 to-transparent py-4 px-8 rounded-xl inline-block">
              ארגונים צריכים דרך טובה יותר לנהל את הרווחה לעובדים
            </p>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Section 3: The Solution ─────────────────────────────────────────────────
function SolutionSection() {
  const features = [
    {
      icon: <BarChart3 size={28} className="text-stripe-purple" />,
      title: 'ניהול תקציבי רווחה',
      desc: 'הקצו תקציבים לכל עובד, לכל צוות ולכל אירוע – חגים, ימי הולדת, ותק ועוד.',
      bullets: ['הקצאה לפי עובד', 'הקצאה לפי צוות', 'הקצאה לפי אירוע (חגים, ימי הולדת)'],
      gradient: 'from-purple-50 via-white to-blue-50',
      iconBg: 'bg-purple-50',
    },
    {
      icon: <Gift size={28} className="text-emerald-600" />,
      title: 'קטלוג מתנות והטבות',
      desc: 'מאות מותגים, חוויות, קניות ומסעדות – הכל במקום אחד עם חוויית בחירה אישית לעובד.',
      bullets: ['מותגים מובילים', 'חוויות ואטרקציות', 'קניות ומסעדות'],
      gradient: 'from-emerald-50 via-white to-cyan-50',
      iconBg: 'bg-emerald-50',
    },
    {
      icon: <Zap size={28} className="text-orange-500" />,
      title: 'שליחת מתנות מיידית',
      desc: 'שלחו מתנות לעובדים בלחיצת כפתור – באימייל, SMS או לינק אישי.',
      bullets: ['שליחה באימייל', 'שליחה ב-SMS', 'לינק אישי למימוש'],
      gradient: 'from-orange-50 via-white to-yellow-50',
      iconBg: 'bg-orange-50',
    },
  ];

  return (
    <section id="features" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="max-w-3xl mb-16">
            <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">הפתרון</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              פלטפורמה אחת לניהול כל תקציב הרווחה
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Nexus מאפשרת לארגונים לנהל את כל תקציב הרווחה, המתנות וההטבות לעובדים ממקום אחד – בצורה אוטומטית, שקופה ופשוטה.
            </p>
          </div>
        </FadeInSection>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <FadeInSection key={i}>
              <div className={`bg-gradient-to-br ${feature.gradient} rounded-2xl p-8 border border-slate-100 hover:shadow-xl transition-all duration-300 h-full`}>
                <div className={`w-14 h-14 rounded-xl ${feature.iconBg} flex items-center justify-center mb-6 shadow-sm`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 mb-5 leading-relaxed">{feature.desc}</p>
                <ul className="space-y-2">
                  {feature.bullets.map((bullet, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle size={16} className="text-stripe-purple shrink-0" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 4: Benefits for Management ──────────────────────────────────────
function BenefitsSection() {
  const benefits = [
    {
      icon: <BarChart3 size={24} />,
      title: 'דאשבורד ניהולי מרכזי',
      desc: 'תמונה מלאה של כל תקציבי הרווחה, ניצולם, יתרות ופילוח לפי צוותים ואירועים.',
    },
    {
      icon: <Shield size={24} />,
      title: 'שקיפות תקציבית מלאה',
      desc: 'דוחות מפורטים בזמן אמת על כל הוצאה, עם יכולת ייצוא ואינטגרציה למערכות הנהלת חשבונות.',
    },
    {
      icon: <Zap size={24} />,
      title: 'הפחתת עומס אדמיניסטרטיבי',
      desc: 'אוטומציה של תהליכים חוזרים – שליחה אוטומטית לימי הולדת, חגים ואירועים קבועים.',
    },
    {
      icon: <Heart size={24} />,
      title: 'חוויית עובד משופרת',
      desc: 'עובדים בוחרים את המתנה שמתאימה להם מתוך קטלוג עשיר ומגוון – שביעות רצון גבוהה יותר.',
    },
  ];

  return (
    <section id="benefits" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="max-w-3xl mb-16">
            <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">למנהלים</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              שליטה מלאה בתקציב הרווחה
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              כלים חכמים ל-HR ול-CFO שמאפשרים ניהול יעיל, חיסכון בזמן ובקרה תקציבית מלאה.
            </p>
          </div>
        </FadeInSection>

        <div className="grid md:grid-cols-2 gap-6">
          {benefits.map((benefit, i) => (
            <FadeInSection key={i}>
              <div className="flex gap-5 p-6 rounded-2xl hover:bg-slate-50 transition-colors duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-stripe-purple/10 flex items-center justify-center text-stripe-purple shrink-0 group-hover:bg-stripe-purple group-hover:text-white transition-colors duration-300">
                  {benefit.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{benefit.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{benefit.desc}</p>
                </div>
              </div>
            </FadeInSection>
          ))}
        </div>

        {/* Two-audience callout */}
        <FadeInSection>
          <div className="mt-16 grid md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
              <div className="flex items-center gap-3 mb-4">
                <Users size={24} className="text-blue-600" />
                <h4 className="text-lg font-bold text-slate-900">למנהלי HR</h4>
              </div>
              <p className="text-slate-600 leading-relaxed">
                שפרו את חוויית העובד, הגבירו מחוברות ושביעות רצון, ותנו לעובדים להרגיש מוערכים – הכל מתוך פלטפורמה אחת.
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-8 border border-emerald-100">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp size={24} className="text-emerald-600" />
                <h4 className="text-lg font-bold text-slate-900">ל-CFO ומנהלי כספים</h4>
              </div>
              <p className="text-slate-600 leading-relaxed">
                שקיפות תקציבית מלאה, בקרת הוצאות בזמן אמת, דוחות מפורטים ואינטגרציה עם מערכות הנהלת חשבונות.
              </p>
            </div>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Section 5: Competitive Differentiation ──────────────────────────────────
function DifferentiationSection() {
  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="max-w-3xl mb-16">
            <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">למה Nexus</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              יותר מספק שוברים
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              בעוד פלטפורמות מסורתיות מציעות קטלוג מתנות בלבד, Nexus מספקת תשתית מלאה לניהול הטבות לעובדים.
            </p>
          </div>
        </FadeInSection>

        <FadeInSection>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Traditional */}
            <div className="bg-white rounded-2xl p-8 border border-slate-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Gift size={20} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-400">פלטפורמות מסורתיות</h3>
              </div>
              <ul className="space-y-4">
                {[
                  'קטלוג שוברים קבוע',
                  'ללא ניהול תקציב',
                  'שליחה ידנית בלבד',
                  'ללא אפשרות התאמה אישית',
                  'ללא דוחות ובקרה',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-400">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-200 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Nexus */}
            <div className="bg-gradient-to-br from-stripe-purple/5 to-purple-50 rounded-2xl p-8 border-2 border-stripe-purple/20 shadow-lg relative overflow-hidden">
              <div className="absolute top-4 left-4 bg-stripe-purple text-white text-[10px] font-bold px-2 py-0.5 rounded-full">מומלץ</div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-stripe-purple/10 flex items-center justify-center">
                  <Star size={20} className="text-stripe-purple" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Nexus</h3>
              </div>
              <ul className="space-y-4">
                {[
                  'בניית מועדון הטבות לעובדים',
                  'הוספת ספקים פרטיים משלכם',
                  'הפעלת תוכניות נאמנות',
                  'שילוב הטבות שוטפות עם מתנות',
                  'אוטומציה ודוחות בזמן אמת',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-800">
                    <CheckCircle size={20} className="text-stripe-purple shrink-0" />
                    <span className="font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Section 6: Use Cases ────────────────────────────────────────────────────
function UseCasesSection() {
  const useCases = [
    {
      icon: <Calendar size={28} className="text-red-500" />,
      title: 'מתנות לחג לעובדים',
      desc: 'שלחו מתנות לחג לכל העובדים באופן אוטומטי – ראש השנה, פסח, חנוכה ועוד.',
      color: 'from-red-50 to-orange-50',
      border: 'border-red-100',
    },
    {
      icon: <Gift size={28} className="text-pink-500" />,
      title: 'מתנות ליום הולדת',
      desc: 'הגדירו תקציב ליום הולדת וזה קורה אוטומטית. העובד בוחר, אתם רק מאשרים.',
      color: 'from-pink-50 to-rose-50',
      border: 'border-pink-100',
    },
    {
      icon: <TrendingUp size={28} className="text-emerald-500" />,
      title: 'בונוסים ותמריצים',
      desc: 'תגמלו עובדים מצטיינים עם מתנות מיידיות – ללא צורך בתהליכי רכש מסורבלים.',
      color: 'from-emerald-50 to-teal-50',
      border: 'border-emerald-100',
    },
    {
      icon: <Briefcase size={28} className="text-blue-500" />,
      title: 'תקציב רווחה שנתי',
      desc: 'הקצו תקציב רווחה שנתי לכל עובד ותנו לו לבחור איך להשתמש בו לאורך השנה.',
      color: 'from-blue-50 to-indigo-50',
      border: 'border-blue-100',
    },
  ];

  return (
    <section id="use-cases" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">שימושים</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              איך ארגונים משתמשים במערכת
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Nexus מתאימה לכל תרחיש של מתנות לעובדים, הטבות ותקציבי רווחה.
            </p>
          </div>
        </FadeInSection>

        <div className="grid md:grid-cols-2 gap-6">
          {useCases.map((useCase, i) => (
            <FadeInSection key={i}>
              <div className={`bg-gradient-to-br ${useCase.color} rounded-2xl p-8 border ${useCase.border} hover:shadow-lg transition-shadow duration-300`}>
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                    {useCase.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{useCase.title}</h3>
                    <p className="text-slate-600 leading-relaxed">{useCase.desc}</p>
                  </div>
                </div>
              </div>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 7: Who is it for ────────────────────────────────────────────────
function AudienceSection() {
  const audiences = [
    {
      icon: <Building2 size={32} className="text-stripe-purple" />,
      title: 'חברות הייטק',
      desc: 'פתרון מושלם לחברות הייטק שמחפשות דרך חכמה לנהל הטבות ומתנות לעובדים.',
      stat: '500+',
      statLabel: 'חברות הייטק',
    },
    {
      icon: <Globe size={32} className="text-blue-600" />,
      title: 'ארגונים גדולים',
      desc: 'תשתית סקיילבילית שמתאימה לארגונים עם אלפי עובדים ותקציבי רווחה מורכבים.',
      stat: '10K+',
      statLabel: 'עובדים בממוצע',
    },
    {
      icon: <Users size={32} className="text-emerald-600" />,
      title: 'צוותים מבוזרים',
      desc: 'ניהול מתנות והטבות לעובדים מרוחקים, בסניפים שונים ובמיקומים גאוגרפיים מגוונים.',
      stat: '24/7',
      statLabel: 'גישה מכל מקום',
    },
  ];

  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">למי זה מתאים</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              פתרון לחברות וארגונים מכל הגדלים
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              בין אם אתם סטארטאפ עם 50 עובדים או ארגון עם 10,000 – Nexus מתאימה לכם.
            </p>
          </div>
        </FadeInSection>

        <div className="grid md:grid-cols-3 gap-8">
          {audiences.map((audience, i) => (
            <FadeInSection key={i}>
              <div className="bg-white rounded-2xl p-8 border border-slate-100 hover:shadow-xl transition-shadow duration-300 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-6">
                  {audience.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{audience.title}</h3>
                <p className="text-slate-600 mb-6 leading-relaxed">{audience.desc}</p>
                <div className="pt-4 border-t border-slate-100">
                  <div className="text-2xl font-bold text-stripe-purple">{audience.stat}</div>
                  <div className="text-xs text-slate-500">{audience.statLabel}</div>
                </div>
              </div>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 8: Comparison Table ─────────────────────────────────────────────
function ComparisonSection() {
  const rows = [
    { feature: 'ניהול תקציבי רווחה', traditional: false, nexus: true },
    { feature: 'הקצאה לפי עובד / צוות / אירוע', traditional: false, nexus: true },
    { feature: 'קטלוג מתנות ושוברים', traditional: true, nexus: true },
    { feature: 'הוספת ספקים פרטיים', traditional: false, nexus: true },
    { feature: 'אוטומציה (ימי הולדת, חגים)', traditional: false, nexus: true },
    { feature: 'דאשבורד ודוחות בזמן אמת', traditional: false, nexus: true },
    { feature: 'מועדון הטבות לעובדים', traditional: false, nexus: true },
    { feature: 'תוכניות נאמנות', traditional: false, nexus: true },
    { feature: 'גמישות מלאה בהתאמה אישית', traditional: false, nexus: true },
    { feature: 'API ואינטגרציות', traditional: false, nexus: true },
  ];

  return (
    <section id="comparison" className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-6">
        <FadeInSection>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">השוואה</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Nexus מול פלטפורמות מתנות מסורתיות
            </h2>
          </div>
        </FadeInSection>

        <FadeInSection>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-200">
              <div className="p-4 font-bold text-slate-900">תכונה</div>
              <div className="p-4 text-center font-bold text-slate-400">פלטפורמות מסורתיות</div>
              <div className="p-4 text-center font-bold text-stripe-purple">Nexus</div>
            </div>
            {rows.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 border-b border-slate-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <div className="p-4 text-sm text-slate-700 font-medium">{row.feature}</div>
                <div className="p-4 text-center">
                  {row.traditional ? (
                    <CheckCircle size={18} className="text-slate-300 mx-auto" />
                  ) : (
                    <div className="w-5 h-0.5 bg-slate-200 mx-auto mt-2" />
                  )}
                </div>
                <div className="p-4 text-center">
                  <CheckCircle size={18} className="text-stripe-purple mx-auto" />
                </div>
              </div>
            ))}
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Section 9: SEO Content ──────────────────────────────────────────────────
function SEOSection() {
  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-4xl mx-auto px-6">
        <FadeInSection>
          <div className="bg-white rounded-2xl p-10 md:p-14 border border-slate-200 shadow-sm">
            <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">מדריך</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-8">
              מדריך לניהול תקציב רווחה לעובדים
            </h2>

            <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed space-y-6">
              <h3 className="text-xl font-bold text-slate-800 mt-0">איך ארגונים מנהלים תקציב רווחה לעובדים?</h3>
              <p>
                ניהול תקציב רווחה לעובדים הוא אחד התהליכים החשובים ביותר בכל ארגון. תקציב הרווחה כולל מתנות לעובדים,
                שוברים לעובדים, הטבות לעובדים ומתנות לחג לעובדים. ארגונים רבים מקצים בין 1,000 ל-5,000 שקלים
                לעובד בשנה עבור תקציב רווחה, כולל מתנות לחג, ימי הולדת, בונוסים והטבות שוטפות.
              </p>

              <h3 className="text-xl font-bold text-slate-800">מה כולל תקציב רווחה טיפוסי?</h3>
              <p>
                תקציב רווחה לעובדים כולל בדרך כלל מספר רכיבים: מתנות לחגים (ראש השנה, פסח, חנוכה),
                מתנות ליום הולדת, בונוסים ותמריצים, ותק, והטבות שוטפות כמו מועדון הטבות לעובדים.
                ארגונים מתקדמים מספקים לעובדים גמישות בבחירת המתנות וההטבות, מה שמעלה משמעותית
                את שביעות הרצון.
              </p>

              <h3 className="text-xl font-bold text-slate-800">איך לבחור פתרון לניהול מתנות לעובדים?</h3>
              <p>
                בבחירת פתרון לניהול מתנות לעובדים ותקציב רווחה, חשוב להתייחס למספר קריטריונים:
                ניהול תקציבי מרכזי, שקיפות ודיווח, מגוון הטבות ומתנות, אוטומציה של תהליכים,
                יכולת התאמה אישית, ואינטגרציה עם מערכות HR קיימות. Nexus מציעה את כל היכולות הללו
                בפלטפורמה אחת – תשתית הטבות לעובדים שמשלבת ניהול תקציבי, קטלוג מתנות ושוברים,
                ואוטומציה מלאה.
              </p>
            </div>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Section 10: Final CTA ───────────────────────────────────────────────────
function FinalCTASection() {
  return (
    <section id="cta-final" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 bg-stripe-blue">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #635BFF, transparent 40%), radial-gradient(circle at 80% 80%, #ff6b9d, transparent 40%)' }} />
      </div>

      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <FadeInSection>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            רוצים לשפר את חוויית העובדים בארגון?
          </h2>
          <p className="text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed">
            הצטרפו למאות ארגונים שכבר משתמשים ב-Nexus לניהול תקציב רווחה, מתנות לעובדים והטבות – הכל ממקום אחד.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 bg-stripe-purple hover:bg-stripe-purple/85 text-white font-bold px-10 py-4 rounded-lg transition-all duration-300 hover:shadow-xl hover:shadow-stripe-purple/30 text-lg"
            >
              קבעו פגישת הדגמה
              <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                <ArrowLeft size={18} className="inline" />
              </span>
            </a>
            <Link
              to="/he"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold px-10 py-4 rounded-lg transition-all text-lg"
            >
              חזרה לאתר הראשי
            </Link>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function LandingFooter() {
  return (
    <footer className="bg-slate-900 py-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <NexusLogo height={24} variant="white" />
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              תשתית הטבות העובדים המתקדמת ביותר בישראל. ניהול תקציב רווחה, מתנות לעובדים ושוברים לעובדים – הכל בפלטפורמה אחת.
            </p>
          </div>
          <div>
            <h5 className="font-bold text-white mb-4">פתרונות</h5>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><a href="#features" className="hover:text-white transition-colors">ניהול תקציבי רווחה</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">מתנות לעובדים</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">הטבות לעובדים</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">שוברים לעובדים</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-white mb-4">חברה</h5>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Link to="/he" className="hover:text-white transition-colors">אודות</Link></li>
              <li><Link to="/he/blog" className="hover:text-white transition-colors">בלוג</Link></li>
              <li><Link to="/he/privacy" className="hover:text-white transition-colors">פרטיות</Link></li>
              <li><Link to="/he/terms" className="hover:text-white transition-colors">תנאי שימוש</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <div>© {new Date().getFullYear()} Nexus. כל הזכויות שמורות.</div>
          <div className="flex gap-6">
            <Link to="/he/privacy" className="hover:text-slate-300">פרטיות</Link>
            <Link to="/he/terms" className="hover:text-slate-300">תנאי שימוש</Link>
            <Link to="/he/accessibility" className="hover:text-slate-300">נגישות</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Landing Page ───────────────────────────────────────────────────────
export default function NexusLandingPage() {
  useEffect(() => {
    document.title = 'Nexus | ניהול תקציב רווחה ומתנות לעובדים';
    // Set meta description for SEO
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = 'Nexus - פלטפורמה לניהול תקציב רווחה, מתנות לעובדים, שוברים והטבות לעובדים. הקצו תקציבים, שלחו מתנות ונהלו הטבות בצורה פשוטה ושקופה.';

    // Inject Rubik font for Hebrew
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
    <LanguageProvider language="he">
      <div className="min-h-screen bg-white" style={{ fontFamily: "'Rubik', 'Inter', sans-serif" }}>
        <LandingNavbar />
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <BenefitsSection />
        <DifferentiationSection />
        <UseCasesSection />
        <AudienceSection />
        <ComparisonSection />
        <SEOSection />
        <FinalCTASection />
        <LandingFooter />
      </div>
    </LanguageProvider>
  );
}
