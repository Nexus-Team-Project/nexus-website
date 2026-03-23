import { useLanguage } from '../../i18n/LanguageContext';
import type { OnboardingData } from '../../pages/WorkspaceSetupPage';
import type { AuthUser } from '../../contexts/AuthContext';

interface ScheduleStepProps {
  user: AuthUser | null;
  onboardingData: OnboardingData | null;
  onBackToSite: () => void;
  onExplore: () => void;
}

const CONTENT = {
  he: {
    title: 'הסביבה שלכם מוכנה! 🎉',
    subtitle: 'הכל מוגדר ומוכן לשימוש. בחרו כיצד תרצו להמשיך.',
    exploreCta: 'כניסה לדשבורד',
    exploreDesc: 'התחילו לחקור את הסביבה שלכם',
    scheduleCta: 'תיאום שיחת הדרכה',
    scheduleDesc: 'שיחה קצרה של 15 דקות עם הצוות שלנו',
    laterText: 'תמיד ניתן לתאם שיחה מאוחר יותר דרך הדשבורד',
  },
  en: {
    title: 'Your workspace is ready! 🎉',
    subtitle: 'Everything is set up and ready to go. Choose how you\'d like to continue.',
    exploreCta: 'Go to Dashboard',
    exploreDesc: 'Start exploring your workspace',
    scheduleCta: 'Schedule an onboarding call',
    scheduleDesc: 'A quick 15-minute intro with our team',
    laterText: 'You can always schedule a call later from the dashboard',
  },
};

export default function ScheduleStep({ user, onboardingData, onBackToSite, onExplore }: ScheduleStepProps) {
  const { lang } = useLanguage();
  const t = CONTENT[lang === 'he' ? 'he' : 'en'];
  const isRtl = lang === 'he';
  const firstName = user?.fullName?.split(' ')[0];

  return (
    <div className="ws-modal" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="ws-content flex flex-col items-center text-center">
        {/* Success icon */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.title}</h2>
        <p className="text-sm text-gray-500 max-w-md mb-10">{t.subtitle}</p>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
          {/* Explore dashboard */}
          <button
            onClick={onExplore}
            className="group flex flex-col items-center gap-3 rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-6 transition-all hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-500/10"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-[15px]">{t.exploreCta}</div>
              <div className="text-xs text-gray-500 mt-1">{t.exploreDesc}</div>
            </div>
          </button>

          {/* Schedule call */}
          <button
            onClick={() => {
              // Open Calendly or similar scheduling link — for now redirect to dashboard
              onBackToSite();
            }}
            className="group flex flex-col items-center gap-3 rounded-xl border-2 border-gray-200 bg-white p-6 transition-all hover:border-gray-300 hover:shadow-lg"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center shadow-md">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-[15px]">{t.scheduleCta}</div>
              <div className="text-xs text-gray-500 mt-1">{t.scheduleDesc}</div>
            </div>
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-8">{t.laterText}</p>
      </div>
    </div>
  );
}
