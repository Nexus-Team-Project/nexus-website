import { useEffect, useRef, useState } from 'react';
import { Settings2, BarChart3, Headphones, LayoutDashboard, Puzzle, Palette, CheckCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import BorderHighlightCard from '../BorderHighlightCard';

const FEATURES_HE = [
  { icon: Settings2,       title: 'התאמה עמוקה',     desc: 'כיבוי והדלקה של הטבות, צירוף הטבות ייחודיות של הארגון או שניתנו לו ספציפית.', accent: 'violet' },
  { icon: BarChart3,       title: 'ניתוח נתונים',     desc: 'איסוף דאטה על המשתמשים, תובנות בזמן אמת, וניתוח התנהגות קהילת הארגון.', accent: 'emerald' },
  { icon: Headphones,      title: 'תמיכה וניהול',     desc: 'ניהול מלא של תהליך המימוש באינטגרציה לכל ספקי ההטבות שלנו.', accent: 'blue' },
  { icon: LayoutDashboard, title: 'ממשק ניהול',       desc: 'ממשק אחד שנותן שליטה מלאה על כל מועדון ההטבות, נוח ופשוט.', accent: 'amber' },
  { icon: Puzzle,          title: 'אינטגרציה',        desc: 'חיבור חלק לכל הספקים, תהליך מימוש אוטומטי, ושירות ברמה הגבוהה ביותר.', accent: 'rose' },
  { icon: Palette,         title: 'White-Label',       desc: 'הפלטפורמה ממותגת לחלוטין לארגון — לוגו, צבעים, ושם מותאמים אישית.', accent: 'purple' },
];

const FEATURES_EN = [
  { icon: Settings2,       title: 'Deep Customization', desc: 'Toggle benefits on/off, add org-specific benefits or ones negotiated just for you.', accent: 'violet' },
  { icon: BarChart3,       title: 'Analytics',          desc: 'Collect user data, get real-time insights, and analyze community engagement.', accent: 'emerald' },
  { icon: Headphones,      title: 'Full Support',       desc: 'End-to-end redemption management integrated with all our benefit providers.', accent: 'blue' },
  { icon: LayoutDashboard, title: 'Admin Dashboard',    desc: 'One interface to control your entire benefits club — simple and powerful.', accent: 'amber' },
  { icon: Puzzle,          title: 'Integration',        desc: 'Seamless connection to all providers, automated redemption, top-tier service.', accent: 'rose' },
  { icon: Palette,         title: 'White-Label',        desc: 'Fully branded to your organization — logo, colors, and custom identity.', accent: 'purple' },
];

const ACCENT_STYLES: Record<string, { iconBg: string; iconColor: string; borderHover: string; gradient: string; glowColor: string }> = {
  violet:  { iconBg: 'bg-violet-100',  iconColor: 'text-violet-600',  borderHover: 'hover:border-violet-300',  gradient: 'from-violet-500/5 to-transparent',   glowColor: 'rgba(139,92,246,0.15)' },
  emerald: { iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', borderHover: 'hover:border-emerald-300', gradient: 'from-emerald-500/5 to-transparent',  glowColor: 'rgba(16,185,129,0.15)' },
  blue:    { iconBg: 'bg-blue-100',    iconColor: 'text-blue-600',    borderHover: 'hover:border-blue-300',    gradient: 'from-blue-500/5 to-transparent',     glowColor: 'rgba(59,130,246,0.15)' },
  amber:   { iconBg: 'bg-amber-100',   iconColor: 'text-amber-600',   borderHover: 'hover:border-amber-300',   gradient: 'from-amber-500/5 to-transparent',    glowColor: 'rgba(245,158,11,0.15)' },
  rose:    { iconBg: 'bg-rose-100',     iconColor: 'text-rose-600',    borderHover: 'hover:border-rose-300',    gradient: 'from-rose-500/5 to-transparent',     glowColor: 'rgba(244,63,94,0.15)' },
  purple:  { iconBg: 'bg-purple-100',   iconColor: 'text-purple-600',  borderHover: 'hover:border-purple-300',  gradient: 'from-purple-500/5 to-transparent',   glowColor: 'rgba(168,85,247,0.15)' },
};

/* ── Dashed connector lines SVG (desktop only) ── */
function ConnectorLines({ isVisible }: { isVisible: boolean }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none hidden md:block"
      style={{ zIndex: 1, opacity: isVisible ? 1 : 0, transition: 'opacity 0.8s ease 0.3s' }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="line-grad-left" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(139,92,246,0.3)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0.08)" />
        </linearGradient>
        <linearGradient id="line-grad-right" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="rgba(139,92,246,0.3)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0.08)" />
        </linearGradient>
      </defs>
      {/* Left side lines — top, middle, bottom */}
      <path d="M 22% 18% Q 32% 18%, 38% 35%" fill="none" stroke="url(#line-grad-left)" strokeWidth="1.5" strokeDasharray="6 4" />
      <path d="M 22% 50% Q 30% 50%, 38% 50%" fill="none" stroke="url(#line-grad-left)" strokeWidth="1.5" strokeDasharray="6 4" />
      <path d="M 22% 82% Q 32% 82%, 38% 65%" fill="none" stroke="url(#line-grad-left)" strokeWidth="1.5" strokeDasharray="6 4" />
      {/* Right side lines — top, middle, bottom */}
      <path d="M 78% 18% Q 68% 18%, 62% 35%" fill="none" stroke="url(#line-grad-right)" strokeWidth="1.5" strokeDasharray="6 4" />
      <path d="M 78% 50% Q 70% 50%, 62% 50%" fill="none" stroke="url(#line-grad-right)" strokeWidth="1.5" strokeDasharray="6 4" />
      <path d="M 78% 82% Q 68% 82%, 62% 65%" fill="none" stroke="url(#line-grad-right)" strokeWidth="1.5" strokeDasharray="6 4" />
      {/* Dots at card endpoints */}
      {['22% 18%', '22% 50%', '22% 82%', '78% 18%', '78% 50%', '78% 82%'].map((pos, i) => {
        const [cx, cy] = pos.split(' ');
        return <circle key={i} cx={cx} cy={cy} r="3" fill="rgba(139,92,246,0.35)" />;
      })}
    </svg>
  );
}

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

  // Split features: left 3 (indices 0,1,2), right 3 (indices 3,4,5)
  // For RTL: swap sides
  const leftFeatures = isRtl ? features.slice(3, 6) : features.slice(0, 3);
  const rightFeatures = isRtl ? features.slice(0, 3) : features.slice(3, 6);

  const renderCard = (f: typeof features[0], i: number, side: 'left' | 'right') => {
    const Icon = f.icon;
    const accent = ACCENT_STYLES[f.accent];
    const delay = side === 'left' ? i * 0.12 : 0.3 + i * 0.12;
    return (
      <div
        key={f.title}
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateX(0)' : `translateX(${side === 'left' ? '-30px' : '30px'})`,
          transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
          '--glow-color': accent.glowColor,
        } as React.CSSProperties}
      >
        <BorderHighlightCard
          className={`feature-card-new relative rounded-2xl border border-slate-200/80 bg-white p-5 h-full cursor-default ${accent.borderHover} group overflow-hidden`}
        >
          {/* Subtle gradient background */}
          <div className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl`} />

          {/* Shimmer effect */}
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="card-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full" />
          </div>

          {/* Accent line at top */}
          <div className="feature-accent-line absolute top-0 left-0 h-[2px] w-0 transition-all duration-500 rounded-t-2xl" style={{ background: `linear-gradient(90deg, transparent, ${accent.glowColor.replace('0.15', '0.6')}, transparent)` }} />

          <div className="relative z-10 flex items-start gap-4">
            <div
              className={`feature-icon-container w-11 h-11 rounded-xl ${accent.iconBg} flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110`}
            >
              <Icon size={20} className={accent.iconColor} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm font-bold text-slate-900 mb-1 ${he ? 'text-right' : 'text-left'}`}>
                {f.title}
              </h3>
              <p className={`text-xs text-slate-500 leading-relaxed ${he ? 'text-right' : 'text-left'}`}>
                {f.desc}
              </p>
            </div>
          </div>
        </BorderHighlightCard>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <style>{`
        @keyframes floatUp {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes dashedPulse {
          0%, 100% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -20; }
        }
        .feature-card-new {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 3px rgba(10,20,40,0.04);
        }
        .feature-card-new:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 30px var(--glow-color, rgba(0,0,0,0.08)), 0 2px 8px rgba(0,0,0,0.04);
        }
        .feature-card-new:hover .feature-icon-container {
          animation: floatUp 2s ease-in-out infinite;
        }
        .feature-card-new:hover .card-shimmer {
          animation: shimmer 1.5s ease-in-out;
        }
        .feature-card-new:hover .feature-accent-line {
          width: 100%;
        }
        .mindmap-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 768px) {
          .mindmap-layout {
            display: grid;
            grid-template-columns: 1fr 1.4fr 1fr;
            grid-template-rows: 1fr 1fr 1fr;
            gap: 24px;
            align-items: center;
            min-height: 600px;
          }
          .mindmap-center {
            grid-column: 2;
            grid-row: 1 / 4;
          }
        }
      `}</style>

      <div className="mindmap-layout relative">
        {/* Connector lines SVG overlay (desktop) */}
        <ConnectorLines isVisible={isVisible} />

        {/* Left column — 3 cards stacked */}
        {leftFeatures.map((f, i) => (
          <div key={f.title} className="md:col-start-1" style={{ gridRow: `${i + 1}` }}>
            {renderCard(f, i, 'left')}
          </div>
        ))}

        {/* Center — Dashboard */}
        <div
          className="mindmap-center relative z-[2]"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'scale(1)' : 'scale(0.92)',
            transition: 'opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s',
          }}
        >
          <div className="relative bg-gradient-to-br from-violet-50/80 via-white to-purple-50/60 backdrop-blur-xl border-2 border-violet-200/60 rounded-2xl shadow-2xl shadow-violet-100/50 p-3">
            {/* Glowing border effect */}
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-violet-400/20 via-purple-400/10 to-violet-400/20 blur-sm pointer-events-none" />

            <div className="relative bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Browser chrome */}
              <div className="h-9 bg-slate-50 border-b border-slate-100 flex items-center px-3 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-300" />
                <span className={`${isRtl ? 'mr-3' : 'ml-3'} text-[9px] text-slate-400 font-mono`}>nexus.co.il/dashboard</span>
                <div className={`${isRtl ? 'mr-auto' : 'ml-auto'} flex items-center gap-1`}>
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[9px] text-green-600 font-medium">{he ? 'מחובר' : 'Live'}</span>
                </div>
              </div>
              <div className="p-5" dir={direction}>
                {/* Header */}
                <div className="flex justify-between items-center mb-5">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">{he ? 'סה״כ הטבות פעילות' : 'Total Active Benefits'}</div>
                    <div className="text-xl font-bold text-slate-900">{he ? '₪ 2,450,000' : '$2,450,000'}</div>
                  </div>
                  <div className="h-9 w-9 bg-stripe-purple/10 rounded-full flex items-center justify-center">
                    <BarChart3 size={18} className="text-stripe-purple" />
                  </div>
                </div>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mb-5">
                  <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                    <div className="text-base font-bold text-emerald-700">{he ? '₪1.8M' : '$1.8M'}</div>
                    <div className="text-[9px] text-emerald-600">{he ? 'נוצל' : 'Redeemed'}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                    <div className="text-base font-bold text-blue-700">{he ? '₪650K' : '$650K'}</div>
                    <div className="text-[9px] text-blue-600">{he ? 'זמין' : 'Available'}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-2.5 text-center">
                    <div className="text-base font-bold text-purple-700">1,240</div>
                    <div className="text-[9px] text-purple-600">{he ? 'חברים' : 'Members'}</div>
                  </div>
                </div>
                {/* Progress bars */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{he ? 'קאשבק' : 'Cashback'}</span>
                    <span className="text-slate-700 font-semibold">78%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-${isRtl ? 'l' : 'r'} from-stripe-purple to-purple-400 rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: isVisible ? '78%' : '0%' }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{he ? 'גיפט קארדס' : 'Gift Cards'}</span>
                    <span className="text-slate-700 font-semibold">92%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-${isRtl ? 'l' : 'r'} from-emerald-500 to-emerald-300 rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: isVisible ? '92%' : '0%', transitionDelay: '0.3s' }}
                    />
                  </div>
                </div>
                {/* Notification */}
                <div className="mt-4 bg-green-50 rounded-lg p-2.5 border border-green-100 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle size={14} className="text-green-600" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-900">{he ? 'הקמפיין הושלם!' : 'Campaign Complete!'}</div>
                    <div className="text-[9px] text-slate-500">{he ? '350 חברים קיבלו הטבה חדשה' : '350 members received a new benefit'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — 3 cards stacked */}
        {rightFeatures.map((f, i) => (
          <div key={f.title} className="md:col-start-3" style={{ gridRow: `${i + 1}` }}>
            {renderCard(f, i, 'right')}
          </div>
        ))}
      </div>
    </div>
  );
}
