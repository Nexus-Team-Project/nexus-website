import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Users, BarChart3, Zap, Gift, Shield, Calendar, Building2, TrendingUp, Star, Clock, Settings, Heart, Briefcase, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import { lazy, Suspense } from 'react';
import AnimatedGradient from '../components/AnimatedGradient';
import BorderHighlightCard from '../components/BorderHighlightCard';
import { LanguageProvider } from '../i18n/LanguageContext';
import StoryGiftCards from '../components/benefits/StoryGiftCards';
import PartnerBubbles from '../components/PartnerBubbles';
import BenefitsFeatureGrid from '../components/benefits/BenefitsFeatureGrid';

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
            <div className="lg:order-2 hidden lg:block relative">
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

              {/* Floating notification - positioned on the panel */}
              <div className="absolute -bottom-6 left-4 bg-white rounded-xl shadow-xl p-4 border border-slate-100 w-64 transform -rotate-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle size={20} className="text-green-600" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">המתנות נשלחו!</div>
                    <div className="text-[10px] text-slate-500">350 עובדים קיבלו מתנה לחג</div>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 w-full rounded-full" />
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
              <BorderHighlightCard className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:shadow-lg transition-shadow duration-300">
                <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center mb-5">
                  {problem.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{problem.title}</h3>
                <p className="text-slate-600 leading-relaxed">{problem.desc}</p>
              </BorderHighlightCard>
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
              <BorderHighlightCard className={`bg-gradient-to-br ${feature.gradient} rounded-2xl p-8 border border-slate-100 hover:shadow-xl transition-all duration-300 h-full`}>
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
              </BorderHighlightCard>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Story cards data for values section ─────────────────────────────────────
const WELFARE_STORY_CARDS = [
  {
    id: 'giftcards',
    title: 'תנו מתנות בארץ וגם בחו״ל',
    Component: StoryGiftCards,
  },
  {
    id: 'brands',
    title: 'תנו מתנה שהעובד באמת בוחר בה',
    Component: () => (
      <div className="relative w-full overflow-hidden" style={{ minHeight: 520 }}>
        <PartnerBubbles />
      </div>
    ),
  },
  {
    id: 'dashboard',
    title: 'שקיפות מלאה — עקבו אחר ניצול התקציב',
    Component: () => (
      <div className="w-full px-4 py-8" style={{ minHeight: 520 }}>
        <BenefitsFeatureGrid />
      </div>
    ),
  },
];

// ─── Section: Values Stories Slider ──────────────────────────────────────────
function ValuesStoriesSection() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const cardWidth = el.firstElementChild?.clientWidth ?? 380;
    const gap = 24;
    const index = Math.round(Math.abs(el.scrollLeft) / (cardWidth + gap));
    setActiveIndex(Math.min(index, WELFARE_STORY_CARDS.length - 1));
  };

  const scrollToIndex = (i: number) => {
    if (!scrollRef.current) return;
    const cardWidth = scrollRef.current.firstElementChild?.clientWidth ?? 380;
    const gap = 24;
    const target = i * (cardWidth + gap);
    scrollRef.current.scrollTo({
      left: -target,
      behavior: 'smooth',
    });
  };

  return (
    <section className="relative py-20 md:py-32 bg-white overflow-hidden">
      {/* hide scrollbar + hide internal story text */}
      <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}.story-no-text>div>div:first-child{display:none!important}`}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block bg-stripe-purple/10 text-stripe-purple text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
            הערכים שלנו
          </span>
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            הכל מתחיל בחוויה
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
            Nexus מאפשרת לעובדים ליהנות ממתנות והטבות בדיוק כמו שהם רוצים.
          </p>
        </div>

        {/* Gallery container with arrows */}
        <div className="relative">
          {/* Right arrow (RTL previous) */}
          <button
            onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
            className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white border border-slate-200 shadow-lg items-center justify-center hover:bg-slate-50 transition-colors -right-4 lg:-right-6"
            aria-label="Previous"
          >
            <ChevronRight size={20} className="text-slate-600" />
          </button>

          {/* Left arrow (RTL next) */}
          <button
            onClick={() => scrollToIndex(Math.min(WELFARE_STORY_CARDS.length - 1, activeIndex + 1))}
            className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white border border-slate-200 shadow-lg items-center justify-center hover:bg-slate-50 transition-colors -left-4 lg:-left-6"
            aria-label="Next"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>

          {/* Scroll track */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4 px-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {WELFARE_STORY_CARDS.map((card) => (
              <BorderHighlightCard
                key={card.id}
                className="flex-shrink-0 w-[320px] sm:w-[380px] snap-center rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Card header */}
                <div className="px-5 pt-5 pb-3 text-right">
                  <h3 className="text-lg font-bold" style={{ color: '#635BFF' }}>
                    {card.title}
                  </h3>
                </div>

                {/* Animation container */}
                <div className="relative overflow-hidden" style={{ height: 480 }}>
                  <div className="story-no-text" style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                    <card.Component />
                  </div>
                </div>
              </BorderHighlightCard>
            ))}
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2.5 mt-6">
          {WELFARE_STORY_CARDS.map((card, i) => (
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

// ─── Section 6: Use Cases (Horizontal Scrolling Gallery) ─────────────────────
function UseCasesSection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 420;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const useCases = [
    {
      title: 'מתנות לחג לעובדים',
      desc: 'שלחו מתנות לחג לכל העובדים באופן אוטומטי – ראש השנה, פסח, חנוכה ועוד.',
      image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&q=80',
      gradient: 'from-red-500 to-orange-500',
    },
    {
      title: 'מתנות ליום הולדת',
      desc: 'הגדירו תקציב ליום הולדת וזה קורה אוטומטית. העובד בוחר, אתם רק מאשרים.',
      image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80',
      gradient: 'from-pink-500 to-rose-500',
    },
    {
      title: 'בונוסים ותמריצים',
      desc: 'תגמלו עובדים מצטיינים עם מתנות מיידיות – ללא צורך בתהליכי רכש מסורבלים.',
      image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80',
      gradient: 'from-emerald-500 to-teal-500',
    },
    {
      title: 'תקציב רווחה שנתי',
      desc: 'הקצו תקציב רווחה שנתי לכל עובד ותנו לו לבחור איך להשתמש בו לאורך השנה.',
      image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80',
      gradient: 'from-blue-500 to-indigo-500',
    },
  ];

  return (
    <section id="use-cases" className="py-24 bg-slate-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <FadeInSection>
          <div className="flex items-end justify-between mb-12">
            <div>
              <span className="text-stripe-purple font-bold text-sm tracking-wide mb-3 block">שימושים</span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                איך ארגונים משתמשים במערכת
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed max-w-2xl">
                Nexus מתאימה לכל תרחיש של מתנות לעובדים, הטבות ותקציבי רווחה.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => scroll('right')}
                className="w-10 h-10 rounded-full border border-slate-200 hover:border-stripe-purple hover:text-stripe-purple flex items-center justify-center text-slate-400 transition-colors"
                aria-label="גלול ימינה"
              >
                <ChevronRight size={20} />
              </button>
              <button
                onClick={() => scroll('left')}
                className="w-10 h-10 rounded-full border border-slate-200 hover:border-stripe-purple hover:text-stripe-purple flex items-center justify-center text-slate-400 transition-colors"
                aria-label="גלול שמאלה"
              >
                <ChevronLeft size={20} />
              </button>
            </div>
          </div>
        </FadeInSection>

        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {useCases.map((useCase, i) => (
            <BorderHighlightCard
              key={i}
              className="snap-start shrink-0 w-[340px] md:w-[400px] rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow duration-300 group"
            >
              {/* Image area */}
              <div className="h-56 relative overflow-hidden">
                <img
                  src={useCase.image}
                  alt={useCase.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${useCase.gradient} opacity-20`} />
              </div>
              {/* Content area */}
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
    <section className="py-24 bg-white">
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
              <BorderHighlightCard className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:shadow-xl transition-shadow duration-300 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-6 shadow-sm">
                  {audience.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{audience.title}</h3>
                <p className="text-slate-600 mb-6 leading-relaxed">{audience.desc}</p>
                <div className="pt-4 border-t border-slate-100">
                  <div className="text-2xl font-bold text-stripe-purple">{audience.stat}</div>
                  <div className="text-xs text-slate-500">{audience.statLabel}</div>
                </div>
              </BorderHighlightCard>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ───────────────────────────────────────────────────────────────
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

// ─── Main Landing Page ───────────────────────────────────────────────────────
export default function NexusLandingPage() {
  useEffect(() => {
    document.title = 'Nexus | ניהול תקציב רווחה ומתנות לעובדים';
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = 'Nexus - פלטפורמה לניהול תקציב רווחה, מתנות לעובדים, שוברים והטבות לעובדים. הקצו תקציבים, שלחו מתנות ונהלו הטבות בצורה פשוטה ושקופה.';

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
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <ValuesStoriesSection />
        <BenefitsSection />
        <DifferentiationSection />
        <UseCasesSection />
        <AudienceSection />
        <FinalCTASection />
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </div>
    </LanguageProvider>
  );
}
