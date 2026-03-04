import nexusBlackLogo from '../../assets/logos/nexus-logo-black.png';
import { useLanguage } from '../../i18n/LanguageContext';
import type { AuthUser } from '../../contexts/AuthContext';
import type { OnboardingData } from '../../pages/WorkspaceSetupPage';

interface ScheduleStepProps {
  user: AuthUser | null;
  onboardingData: OnboardingData | null;
  onBackToSite: () => void;
  onExplore: () => void;
}

const TOTAL_STEPS = 3;

const CONTENT = {
  he: {
    titleWith: (name: string) => `${name}, סביבת העבודה שלכם כמעט מוכנה`,
    titleWithout: 'סביבת העבודה שלכם כמעט מוכנה',
    desc: 'הצוות שלנו יסיים את ההגדרה ויפעיל את הסביבה שלכם. מומחה נקסוס ידריך אתכם בתהליך ההגדרה כדי שתוכלו לצאת לדרך במהירות.',
    expectTitle: 'מה לצפות',
    expectItems: [
      'שיחת הגדרה של 30 דקות עם מומחה נקסוס',
      'סיור חי בלוח הבקרה שלכם',
      'הגדרה מותאמת לצרכים שלכם',
    ],
    backToSite: 'חזרה לאתר',
    explore: 'גלו את נקסוס',
    schedule: 'קבעו פגישה',
  },
  en: {
    titleWith: (name: string) => `${name}, your workspace is almost ready`,
    titleWithout: 'Your workspace is almost ready',
    desc: 'Our team will finalize the configuration and activate your environment. A Nexus specialist will walk you through the setup so you can launch quickly.',
    expectTitle: 'What to expect',
    expectItems: [
      '30-minute setup call with a Nexus specialist',
      'Live walkthrough of your dashboard',
      'Configuration tailored to your use case',
    ],
    backToSite: 'Back to website',
    explore: 'Explore Nexus',
    schedule: 'Schedule a session',
  },
};

export default function ScheduleStep({ user, onBackToSite, onExplore }: ScheduleStepProps) {
  const { language, direction } = useLanguage();
  const c = CONTENT[language === 'he' ? 'he' : 'en'];
  const firstName = user?.fullName?.split(' ')[0] ?? '';

  return (
    <div className="ws-modal" dir={direction}>

      {/* ── Header — always LTR: logo on LEFT, bars on RIGHT ── */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 shrink-0" dir="ltr">
        <img src={nexusBlackLogo} alt="Nexus" className="h-8 w-auto object-contain" />
        {/* All steps filled — setup complete */}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="w-10 h-[3px] rounded-full bg-indigo-500" />
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="ws-content">

        {/* Check icon */}
        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-5 ring-1 ring-emerald-100">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17L4 12"/>
          </svg>
        </div>

        <h1 className="text-[22px] font-semibold text-slate-900 leading-tight mb-3">
          {firstName ? (
            <>
              <span className="font-bold text-indigo-600">{firstName},</span>{' '}
              {c.titleWith(firstName).replace(`${firstName}, `, '')}
            </>
          ) : c.titleWithout}
        </h1>

        <p className="text-[14px] text-slate-500 leading-relaxed mb-6">
          {c.desc}
        </p>

        {/* What to expect */}
        <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
          <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider mb-3">
            {c.expectTitle}
          </p>
          <ul className="space-y-2">
            {c.expectItems.map(item => (
              <li key={item} className="flex items-start gap-2.5 text-[13px] text-indigo-800">
                <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M20 6L9 17L4 12"/>
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="ws-footer-between">
        <button
          onClick={onBackToSite}
          className="text-[14px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          {c.backToSite}
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onExplore}
            className="text-[14px] text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
          >
            {c.explore}
          </button>
          <button
            onClick={() => window.open('https://calendly.com', '_blank')}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[14px] font-semibold rounded-lg transition-colors"
          >
            {c.schedule}
          </button>
        </div>
      </div>

    </div>
  );
}
