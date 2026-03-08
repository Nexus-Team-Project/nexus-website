import { Settings2, BarChart3, Headphones, LayoutDashboard, Puzzle, Palette } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

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

export default function BenefitsFeatureGrid() {
  const { language, direction } = useLanguage();
  const he = language === 'he';
  const features = he ? FEATURES_HE : FEATURES_EN;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {features.map((f) => {
        const Icon = f.icon;
        return (
          <div
            key={f.title}
            className="benefit-feature-card rounded-2xl border border-slate-200 bg-white p-6 cursor-default"
            style={{ boxShadow: '0 4px 16px rgba(10,20,40,0.04)' }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(99,91,255,0.08)' }}
            >
              <Icon size={22} className="text-stripe-purple" />
            </div>
            <h3 className={`text-lg font-bold text-slate-900 mb-2 ${he ? 'text-right' : 'text-left'}`}>
              {f.title}
            </h3>
            <p className={`text-sm text-slate-500 leading-relaxed ${he ? 'text-right' : 'text-left'}`}>
              {f.desc}
            </p>
          </div>
        );
      })}
    </div>
  );
}
