import nexusBlackLogo from '../../assets/logos/nexus-logo-black.png';
import { useLanguage } from '../../i18n/LanguageContext';

interface WelcomeModalProps {
  onStart: () => void;
  onBack: () => void;
}

const TOTAL_STEPS = 3;

const CONTENT = {
  he: {
    title: 'ברוכים הבאים לנקסוס.',
    subtitle: 'ספרו לנו קצת על הארגון שלכם כדי להתאים את הסביבה. תמיד ניתן לשנות זאת מאוחר יותר.',
    steps: [
      'ספרו לנו על הארגון שלכם',
      'בחרו את הפתרונות הרלוונטיים',
      'הוסיפו אפשרויות נוספות (אופציונלי)',
    ],
    skip: 'דלג לעת עתה',
    continue: 'המשך',
  },
  en: {
    title: 'Welcome to Nexus.',
    subtitle: 'Answer a few questions about your organization to customize your workspace. You can always change this later.',
    steps: [
      'Tell us about your organization',
      'Choose the features that fit you',
      'Add more options (optional)',
    ],
    skip: 'Skip for now',
    continue: 'Continue',
  },
};

export default function WelcomeModal({ onStart, onBack }: WelcomeModalProps) {
  const { language, direction } = useLanguage();
  const c = CONTENT[language === 'he' ? 'he' : 'en'];

  return (
    <div className="ws-modal" dir={direction}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 shrink-0">
        <img src={nexusBlackLogo} alt="Nexus" className="h-8 w-auto object-contain" />
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="w-10 h-[3px] rounded-full bg-slate-200" />
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="ws-content">
        <p className="text-[22px] leading-snug text-slate-800 mb-6">
          <span className="font-bold text-indigo-600">{c.title}</span>{' '}
          {c.subtitle}
        </p>

        <ul className="space-y-3 text-[14px] text-slate-500">
          {c.steps.map((item, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Footer ── */}
      <div className="ws-footer">
        <button
          onClick={onBack}
          className="text-[14px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          {c.skip}
        </button>
        <button
          onClick={onStart}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[14px] font-semibold rounded-lg transition-colors"
        >
          {c.continue}
        </button>
      </div>

    </div>
  );
}
