import { useEffect, useRef, useState } from 'react';
import { Settings2, BarChart3, Headphones, LayoutDashboard, Puzzle, Palette, CheckCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import BorderHighlightCard from '../BorderHighlightCard';

const FEATURES_HE = [
  { icon: Settings2,       title: 'התאמה עמוקה',     desc: 'כיבוי והדלקה של הטבות, צירוף הטבות ייחודיות של הארגון או שניתנו לו ספציפית.' },
  { icon: BarChart3,       title: 'ניתוח נתונים',     desc: 'איסוף דאטה על המשתמשים, תובנות בזמן אמת, וניתוח התנהגות קהילת הארגון.' },
  { icon: Headphones,      title: 'תמיכה וניהול',     desc: 'ניהול מלא של תהליך המימוש באינטגרציה לכל ספקי ההטבות שלנו.' },
  { icon: LayoutDashboard, title: 'ממשק ניהול',       desc: 'ממשק אחד שנותן שליטה מלאה על כל מועדון ההטבות, נוח ופשוט.' },
  { icon: Puzzle,          title: 'אינטגרציה',        desc: 'חיבור חלק לכל הספקים, תהליך מימוש אוטומטי, ושירות ברמה הגבוהה ביותר.' },
  { icon: Palette,         title: 'White-Label',       desc: 'הפלטפורמה ממותגת לחלוטין לארגון — לוגו, צבעים, ושם מותאמים אישית.' },
];

const FEATURES_EN = [
  { icon: Settings2,       title: 'Deep Customization', desc: 'Toggle benefits on/off, add org-specific benefits or ones negotiated just for you.' },
  { icon: BarChart3,       title: 'Analytics',          desc: 'Collect user data, get real-time insights, and analyze community engagement.' },
  { icon: Headphones,      title: 'Full Support',       desc: 'End-to-end redemption management integrated with all our benefit providers.' },
  { icon: LayoutDashboard, title: 'Admin Dashboard',    desc: 'One interface to control your entire benefits club — simple and powerful.' },
  { icon: Puzzle,          title: 'Integration',        desc: 'Seamless connection to all providers, automated redemption, top-tier service.' },
  { icon: Palette,         title: 'White-Label',        desc: 'Fully branded to your organization — logo, colors, and custom identity.' },
];

// Card positions around the center dashboard (desktop layout)
// Arranged: 3 on top row, 3 on bottom row, dashboard in the middle
const CARD_POSITIONS = [
  // Top row - left, center, right
  { gridArea: '1 / 1 / 2 / 2' },
  { gridArea: '1 / 2 / 2 / 3' },
  { gridArea: '1 / 3 / 2 / 4' },
  // Bottom row - left, center, right
  { gridArea: '3 / 1 / 4 / 2' },
  { gridArea: '3 / 2 / 4 / 3' },
  { gridArea: '3 / 3 / 4 / 4' },
];

export default function BenefitsFeatureGrid() {
  const { language, direction } = useLanguage();
  const he = language === 'he';
  const isRtl = direction === 'rtl';
  const features = he ? FEATURES_HE : FEATURES_EN;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Flowing lines animation CSS */}
      <style>{`
        @keyframes flowParticle {
          0% { offset-distance: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes dashFlow {
          to { stroke-dashoffset: -20; }
        }
        @keyframes pulseGlow {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(99,91,255,0.3)); }
          50% { filter: drop-shadow(0 0 6px rgba(99,91,255,0.6)); }
        }
        .flow-line {
          stroke-dasharray: 6 4;
          animation: dashFlow 1s linear infinite;
        }
        .flow-particle {
          animation: flowParticle 2.5s ease-in-out infinite;
        }
        .architecture-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-template-rows: auto auto auto;
          gap: 0;
        }
        @media (max-width: 767px) {
          .architecture-grid {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
        }
      `}</style>

      {/* Architecture layout */}
      <div className="architecture-grid relative">
        {/* ── SVG Flowing Lines (desktop only) ── */}
        <svg
          className="hidden md:block absolute inset-0 w-full h-full pointer-events-none z-0"
          style={{ gridArea: '1 / 1 / 4 / 4' }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(99,91,255,0.1)" />
              <stop offset="50%" stopColor="rgba(99,91,255,0.4)" />
              <stop offset="100%" stopColor="rgba(99,91,255,0.1)" />
            </linearGradient>
            <linearGradient id="lineGradientV" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(99,91,255,0.1)" />
              <stop offset="50%" stopColor="rgba(99,91,255,0.4)" />
              <stop offset="100%" stopColor="rgba(99,91,255,0.1)" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Vertical lines from top cards down to dashboard */}
          {/* Left column */}
          <line x1="16.67%" y1="38%" x2="16.67%" y2="42%" stroke="url(#lineGradientV)" strokeWidth="2" className="flow-line" style={{ animationDelay: '0s' }} />
          {/* Center column */}
          <line x1="50%" y1="38%" x2="50%" y2="42%" stroke="url(#lineGradientV)" strokeWidth="2" className="flow-line" style={{ animationDelay: '0.3s' }} />
          {/* Right column */}
          <line x1="83.33%" y1="38%" x2="83.33%" y2="42%" stroke="url(#lineGradientV)" strokeWidth="2" className="flow-line" style={{ animationDelay: '0.6s' }} />

          {/* Vertical lines from dashboard down to bottom cards */}
          {/* Left column */}
          <line x1="16.67%" y1="58%" x2="16.67%" y2="62%" stroke="url(#lineGradientV)" strokeWidth="2" className="flow-line" style={{ animationDelay: '0.9s' }} />
          {/* Center column */}
          <line x1="50%" y1="58%" x2="50%" y2="62%" stroke="url(#lineGradientV)" strokeWidth="2" className="flow-line" style={{ animationDelay: '1.2s' }} />
          {/* Right column */}
          <line x1="83.33%" y1="58%" x2="83.33%" y2="62%" stroke="url(#lineGradientV)" strokeWidth="2" className="flow-line" style={{ animationDelay: '1.5s' }} />

          {/* Horizontal connecting line through dashboard - top */}
          <line x1="10%" y1="40%" x2="90%" y2="40%" stroke="url(#lineGradient)" strokeWidth="1.5" className="flow-line" style={{ animationDelay: '0.2s' }} />
          {/* Horizontal connecting line through dashboard - bottom */}
          <line x1="10%" y1="60%" x2="90%" y2="60%" stroke="url(#lineGradient)" strokeWidth="1.5" className="flow-line" style={{ animationDelay: '0.8s' }} />

          {/* Flowing particles on vertical lines */}
          {[0, 1, 2].map((i) => (
            <circle
              key={`particle-top-${i}`}
              r="3"
              fill="#635bff"
              filter="url(#glow)"
              className="flow-particle"
              style={{ animationDelay: `${i * 0.8}s`, offsetPath: `path('M ${16.67 + i * 33.33}% 38% L ${16.67 + i * 33.33}% 42%')` }}
            >
              <animateMotion
                dur={`${2 + i * 0.3}s`}
                repeatCount="indefinite"
                path={`M 0,-10 L 0,10`}
                keyTimes="0;1"
                keySplines="0.4 0 0.2 1"
                calcMode="spline"
              />
            </circle>
          ))}
          {[0, 1, 2].map((i) => (
            <circle
              key={`particle-bottom-${i}`}
              r="3"
              fill="#635bff"
              filter="url(#glow)"
              className="flow-particle"
              style={{ animationDelay: `${1.5 + i * 0.8}s` }}
            >
              <animateMotion
                dur={`${2 + i * 0.3}s`}
                repeatCount="indefinite"
                path={`M 0,-10 L 0,10`}
                begin={`${1 + i * 0.5}s`}
              />
            </circle>
          ))}
        </svg>

        {/* ── Top Row: 3 Feature Cards ── */}
        {features.slice(0, 3).map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="relative z-10 m-3"
              style={{
                gridArea: CARD_POSITIONS[i].gridArea,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s ease ${i * 0.15}s, transform 0.5s ease ${i * 0.15}s`,
              }}
            >
              <BorderHighlightCard
                className="benefit-feature-card rounded-2xl border border-slate-200 bg-white p-5 h-full cursor-default hover:shadow-lg hover:border-violet-200 transition-all duration-300"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(99,91,255,0.08)' }}
                >
                  <Icon size={20} className="text-stripe-purple" />
                </div>
                <h3 className={`text-base font-bold text-slate-900 mb-1.5 ${he ? 'text-right' : 'text-left'}`}>
                  {f.title}
                </h3>
                <p className={`text-sm text-slate-500 leading-relaxed ${he ? 'text-right' : 'text-left'}`}>
                  {f.desc}
                </p>
              </BorderHighlightCard>
            </div>
          );
        })}

        {/* ── Center: Dashboard (spans full width of grid row 2) ── */}
        <div
          className="relative z-10 md:col-span-3 m-3"
          style={{
            gridArea: '2 / 1 / 3 / 4',
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'scale(1)' : 'scale(0.95)',
            transition: 'opacity 0.6s ease 0.3s, transform 0.6s ease 0.3s',
          }}
        >
          {/* Flowing connection dots on left and right (desktop) */}
          <div className="hidden md:block">
            {/* Left connection nodes */}
            <div className="absolute top-1/2 -translate-y-1/2 -left-1 z-20">
              <div className="w-3 h-3 rounded-full bg-stripe-purple/30 animate-pulse" />
            </div>
            {/* Right connection nodes */}
            <div className="absolute top-1/2 -translate-y-1/2 -right-1 z-20">
              <div className="w-3 h-3 rounded-full bg-stripe-purple/30 animate-pulse" />
            </div>
          </div>

          <div className="relative bg-gradient-to-br from-violet-50/80 via-white to-purple-50/60 backdrop-blur-xl border-2 border-violet-200/60 rounded-2xl shadow-2xl shadow-violet-100/50 p-4 max-w-3xl mx-auto">
            {/* Glowing border effect */}
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-violet-400/20 via-purple-400/10 to-violet-400/20 blur-sm pointer-events-none" />

            <div className="relative bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Browser chrome */}
              <div className="h-10 bg-slate-50 border-b border-slate-100 flex items-center px-4 gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-300" />
                <div className="w-3 h-3 rounded-full bg-yellow-300" />
                <div className="w-3 h-3 rounded-full bg-green-300" />
                <span className={`${isRtl ? 'mr-4' : 'ml-4'} text-[10px] text-slate-400 font-mono`}>nexus.co.il/dashboard</span>
                <div className={`${isRtl ? 'mr-auto' : 'ml-auto'} flex items-center gap-1`}>
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[9px] text-green-600 font-medium">{he ? 'מחובר' : 'Live'}</span>
                </div>
              </div>
              <div className="p-6" dir={direction}>
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">{he ? 'סה״כ הטבות פעילות' : 'Total Active Benefits'}</div>
                    <div className="text-2xl font-bold text-slate-900">{he ? '₪ 2,450,000' : '$2,450,000'}</div>
                  </div>
                  <div className="h-10 w-10 bg-stripe-purple/10 rounded-full flex items-center justify-center">
                    <BarChart3 size={20} className="text-stripe-purple" />
                  </div>
                </div>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-emerald-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-emerald-700">{he ? '₪1.8M' : '$1.8M'}</div>
                    <div className="text-[10px] text-emerald-600">{he ? 'נוצל' : 'Redeemed'}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-blue-700">{he ? '₪650K' : '$650K'}</div>
                    <div className="text-[10px] text-blue-600">{he ? 'זמין' : 'Available'}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-purple-700">1,240</div>
                    <div className="text-[10px] text-purple-600">{he ? 'חברים' : 'Members'}</div>
                  </div>
                </div>
                {/* Progress bars */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{he ? 'קאשבק' : 'Cashback'}</span>
                    <span className="text-slate-700 font-semibold">78%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-${isRtl ? 'l' : 'r'} from-stripe-purple to-purple-400 rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: isVisible ? '78%' : '0%' }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{he ? 'גיפט קארדס' : 'Gift Cards'}</span>
                    <span className="text-slate-700 font-semibold">92%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-${isRtl ? 'l' : 'r'} from-emerald-500 to-emerald-300 rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: isVisible ? '92%' : '0%', transitionDelay: '0.3s' }}
                    />
                  </div>
                </div>
                {/* Notification */}
                <div className="mt-5 bg-green-50 rounded-lg p-3 border border-green-100 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle size={16} className="text-green-600" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">{he ? 'הקמפיין הושלם!' : 'Campaign Complete!'}</div>
                    <div className="text-[10px] text-slate-500">{he ? '350 חברים קיבלו הטבה חדשה' : '350 members received a new benefit'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Animated SVG Connection Lines between cards and dashboard ── */}
        <svg
          className="hidden md:block absolute inset-0 w-full h-full pointer-events-none z-[5]"
          style={{ gridArea: '1 / 1 / 4 / 4' }}
        >
          {/* Flowing particles traveling along paths */}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const col = i < 3 ? i : i - 3;
            const xPercent = 16.67 + col * 33.33;
            const isTop = i < 3;
            const yStart = isTop ? 35 : 65;
            const yEnd = isTop ? 42 : 58;
            return (
              <g key={`flow-group-${i}`}>
                {/* Glowing particle */}
                <circle r="4" fill="#635bff" opacity="0.8" filter="url(#glow)">
                  <animate
                    attributeName="cy"
                    values={isTop ? `${yStart}%;${yEnd}%` : `${yEnd}%;${yStart}%`}
                    dur="2s"
                    repeatCount="indefinite"
                    begin={`${i * 0.4}s`}
                  />
                  <animate
                    attributeName="cx"
                    values={`${xPercent}%;${xPercent}%`}
                    dur="2s"
                    repeatCount="indefinite"
                    begin={`${i * 0.4}s`}
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0.8;0.8;0"
                    dur="2s"
                    repeatCount="indefinite"
                    begin={`${i * 0.4}s`}
                  />
                </circle>
                {/* Trail effect */}
                <circle r="6" fill="none" stroke="#635bff" strokeWidth="1" opacity="0.3">
                  <animate
                    attributeName="cy"
                    values={isTop ? `${yStart}%;${yEnd}%` : `${yEnd}%;${yStart}%`}
                    dur="2s"
                    repeatCount="indefinite"
                    begin={`${i * 0.4}s`}
                  />
                  <animate
                    attributeName="cx"
                    values={`${xPercent}%;${xPercent}%`}
                    dur="2s"
                    repeatCount="indefinite"
                    begin={`${i * 0.4}s`}
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0.3;0.3;0"
                    dur="2s"
                    repeatCount="indefinite"
                    begin={`${i * 0.4 + 0.1}s`}
                  />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* ── Bottom Row: 3 Feature Cards ── */}
        {features.slice(3, 6).map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="relative z-10 m-3"
              style={{
                gridArea: CARD_POSITIONS[i + 3].gridArea,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s ease ${0.5 + i * 0.15}s, transform 0.5s ease ${0.5 + i * 0.15}s`,
              }}
            >
              <BorderHighlightCard
                className="benefit-feature-card rounded-2xl border border-slate-200 bg-white p-5 h-full cursor-default hover:shadow-lg hover:border-violet-200 transition-all duration-300"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(99,91,255,0.08)' }}
                >
                  <Icon size={20} className="text-stripe-purple" />
                </div>
                <h3 className={`text-base font-bold text-slate-900 mb-1.5 ${he ? 'text-right' : 'text-left'}`}>
                  {f.title}
                </h3>
                <p className={`text-sm text-slate-500 leading-relaxed ${he ? 'text-right' : 'text-left'}`}>
                  {f.desc}
                </p>
              </BorderHighlightCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}
