import { useState, useRef } from 'react';
import nexusBlackLogo from '../../assets/logos/nexus-logo-black.png';
import { useLanguage } from '../../i18n/LanguageContext';
import type { OnboardingData } from '../../pages/WorkspaceSetupPage';
import type { AuthUser } from '../../contexts/AuthContext';

const TOTAL_STEPS = 3;

// ── Use-case option definitions ────────────────────────────────────────────
const USE_CASES = {
  he: [
    { id: 'benefits_club',  label: 'מועדון הטבות',                     why: 'מתאים לארגונים המבקשים לחבר קהילות ולהעניק הטבות לחברים',            keywords: /קהילה|עמותה|ארגון|חברים|מועדון/i },
    { id: 'digital_wallet', label: 'ארנק דיגיטלי',                     why: 'מתאים לעסקים המנהלים תשלומים דיגיטליים ותקציבים',                    keywords: /ארנק|תשלום|pay|wallet|דיגיטל/i },
    { id: 'vouchers',       label: 'תוכנית שוברים',                    why: 'מתאים לחברות המנפיקות שוברים, קופונים או כרטיסי מתנה',              keywords: /שובר|קופון|voucher|coupon/i },
    { id: 'employee_gifts', label: 'מתנות לעובדים / מתנות לחגים',     why: 'מתאים לחברות המחפשות פתרון להענקת מתנות ומוטיבציה לצוות',          keywords: /עובד|employee|חג|gift|מתנה|staff|צוות/i },
    { id: 'loyalty',        label: 'תוכנית נאמנות',                    why: 'מתאים לעסקי קמעונאות ומסחר הרוצים לשמר לקוחות ולפתח תגמולים',      keywords: /נאמנות|loyalty|נקודות|חנות|store|retail|מסחר|לקוח/i },
    { id: 'branded_card',   label: 'כרטיס אשראי ממוקד',          why: 'מתאים לבנקים וחברות פיננסיות המנפיקות כרטיסים ממותגים',            keywords: /כרטיס|card|בנק|bank|פרי.פייד|prepaid/i },
    { id: 'payment',        label: 'עיבוד תשלומים לעסק שלי',          why: 'מתאים לעסקים הזקוקים לתשתית סליקה ועיבוד תשלומים',                  keywords: /תשלום|payment|סליקה|processing/i },
    { id: 'not_sure',       label: 'עדיין לא בטוח',                    why: '',                                                                    keywords: null },
  ],
  en: [
    { id: 'benefits_club',  label: 'Benefits club',                     why: 'Great for organizations looking to connect communities and provide member perks',      keywords: /community|nonprofit|organization|members|club/i },
    { id: 'digital_wallet', label: 'Digital wallet',                    why: 'Ideal for businesses managing digital payments and employee budgets',                   keywords: /wallet|digital|pay/i },
    { id: 'vouchers',       label: 'Voucher program',                   why: 'Perfect for companies issuing vouchers, coupons or gift cards',                         keywords: /voucher|coupon|gift.?card/i },
    { id: 'employee_gifts', label: 'Employee gifts / Holiday gifts',    why: 'Designed for companies looking for staff rewards and incentive solutions',              keywords: /employee|staff|team|holiday|gift/i },
    { id: 'loyalty',        label: 'Loyalty program',                   why: 'Tailored for retail and e-commerce businesses aiming to retain customers',              keywords: /loyalty|points|store|retail|shop|customer/i },
    { id: 'branded_card',   label: 'Prepaid / branded card',            why: 'Best for financial institutions and brands issuing branded cards',                      keywords: /card|prepaid|bank|branded/i },
    { id: 'payment',        label: 'Payment processing for my business', why: 'For businesses that need payment infrastructure and checkout capabilities',            keywords: /payment|processing|checkout/i },
    { id: 'not_sure',       label: 'Not sure yet',                      why: '',                                                                                      keywords: null },
  ],
};

function getSuggested(desc: string, lang: 'he' | 'en'): string[] {
  const options = USE_CASES[lang];
  const matched = options.filter(o => o.keywords && o.keywords.test(desc)).map(o => o.id);
  return matched.length > 0 ? matched : ['benefits_club', 'loyalty'];
}

// ── Bilingual UI text ──────────────────────────────────────────────────────
const CONTENT = {
  he: {
    welcomeTitle: (firstName?: string) => firstName ? `ברוכים הבאים לנקסוס, ${firstName}.` : 'ברוכים הבאים לנקסוס.',
    welcomeSubtitle: 'ספרו לנו קצת על הארגון שלכם כדי להתאים את הסביבה. תמיד ניתן לשנות זאת מאוחר יותר.',
    orgNameLabel: 'שם הארגון',
    orgNamePlaceholder: 'נקסוס בע"מ',
    websiteLabel: 'אתר',
    websitePlaceholder: 'www.example.com',
    websiteError: 'כתובת האתר אינה תקינה',
    businessLabel: 'איזה סוג עסק אתם ומה אתם מציעים?',
    businessPlaceholder: 'לדוגמה: רשת קמעונאית המציעה מוצרי אלקטרוניקה ורוצה לפתח תוכנית נאמנות ללקוחות...',
    step1Title: 'אלו הפתרונות שנראים הכי רלוונטיים לכם',
    step1Sub: 'בחרו את כל האפשרויות הרלוונטיות',
    suggested: 'מומלץ',
    whyTitle: 'למה מומלץ?',
    step2Title: 'כמה פרטים עליכם',
    step2Sub: 'כדי שנוכל להתאים את החוויה שלכם טוב יותר. שלב זה הוא אופציונלי.',
    phoneLabel: 'טלפון',
    phonePlaceholder: '+972 50-000-0000',
    roleLabel: 'תפקיד',
    rolePlaceholder: 'לדוגמה: מנכ"ל, מנהל שיווק...',
    back: 'חזרה',
    skip: 'דלג לעת עתה',
    continue: 'המשך',
    finish: 'סיים הגדרה',
    tooltipMsg: 'אנחנו צריכים עוד פרטים כדי להתקדם',
  },
  en: {
    welcomeTitle: (firstName?: string) => firstName ? `Welcome to Nexus, ${firstName}.` : 'Welcome to Nexus.',
    welcomeSubtitle: 'Answer a few questions about your organization to customize your workspace. You can always change this later.',
    orgNameLabel: 'Organization name',
    orgNamePlaceholder: 'Nexus Ltd.',
    websiteLabel: 'Website',
    websitePlaceholder: 'www.example.com',
    websiteError: 'Please enter a valid website URL',
    businessLabel: 'What type of business are you and what do you offer?',
    businessPlaceholder: 'e.g. We are a retail chain offering electronics and want to launch a loyalty program for our customers...',
    step1Title: 'Here are the most relevant solutions for you',
    step1Sub: 'Select all that apply',
    suggested: 'Suggested',
    whyTitle: 'Why suggested?',
    step2Title: 'A bit about you',
    step2Sub: 'To help us personalize your experience. This step is optional.',
    phoneLabel: 'Phone',
    phonePlaceholder: '+1 555-000-0000',
    roleLabel: 'Your role',
    rolePlaceholder: 'e.g. CEO, Marketing Manager...',
    back: 'Back',
    skip: 'Skip for now',
    continue: 'Continue',
    finish: 'Finish setup',
    tooltipMsg: 'We need more details to continue',
  },
};

// ── Component ──────────────────────────────────────────────────────────────
interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => void;
  onBack: () => void;
  user?: AuthUser | null;
}

export default function OnboardingWizard({ onComplete, user }: OnboardingWizardProps) {
  const { language, direction } = useLanguage();
  const lang = language === 'he' ? 'he' : 'en';
  const c = CONTENT[lang];
  const firstName = user?.fullName?.split(' ')[0] ?? sessionStorage.getItem('auth_first_name') ?? undefined;
  const useCases = USE_CASES[lang];

  const [step, setStep] = useState(0);

  // Step 0 fields
  const [orgName, setOrgName]           = useState('');
  const [website, setWebsite]           = useState('');
  const [websiteError, setWebsiteError] = useState(false);
  const [businessDesc, setBusinessDesc] = useState('');

  // Step 1
  const [primarySelected, setPrimarySelected]   = useState<string[]>([]);
  const [primarySuggested, setPrimarySuggested] = useState<string[]>([]);

  // "Why recommended" tooltip (fixed-position, above everything)
  const [hoveredWhyId, setHoveredWhyId]   = useState<string | null>(null);
  const [whyPos, setWhyPos]               = useState({ top: 0, left: 0 });

  // Step 2 fields
  const [phone, setPhone] = useState('');
  const [role, setRole]   = useState('');

  // Disabled-continue tooltip (fixed-position)
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos]   = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // ── URL validation ────────────────────────────────────────────────────────
  const validateWebsite = (val: string) => {
    if (!val.trim()) { setWebsiteError(false); return; }
    try {
      const url = val.startsWith('http') ? val : `https://${val}`;
      const parsed = new URL(url);
      setWebsiteError(!parsed.hostname.includes('.') || parsed.hostname.length < 4);
    } catch {
      setWebsiteError(true);
    }
  };

  const canContinue =
    step === 0 ? orgName.trim() !== '' && businessDesc.trim() !== '' && !websiteError :
    step === 1 ? primarySelected.length > 0 :
    true; // step 2 is optional — always continuable

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNext = () => {
    if (!canContinue) return;
    if (step === 0) {
      const suggested = getSuggested(businessDesc, lang);
      setPrimarySuggested(suggested);
      setPrimarySelected(suggested);
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else {
      onComplete({
        org_name: orgName,
        website,
        business_desc: businessDesc,
        primary_use_cases: primarySelected,
        phone,
        role,
      });
    }
  };

  const handleSkip = () => {
    if (step === 0) {
      setPrimarySelected([]);
      setPrimarySuggested([]);
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  // ── Tooltip helpers ───────────────────────────────────────────────────────
  const handleContinueEnter = () => {
    setShowTooltip(true);
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setTooltipPos({ top: r.top - 8, left: r.left + r.width / 2 });
    }
  };

  const handleWhyEnter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHoveredWhyId(id);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setWhyPos({ top: r.top - 8, left: r.left + r.width / 2 });
  };

  // ── Back arrow (direction-aware) ─────────────────────────────────────────
  const BackArrow = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      {direction === 'rtl'
        ? <path d="M5 12H19M12 5l7 7-7 7" />
        : <path d="M19 12H5M12 5l-7 7 7 7" />
      }
    </svg>
  );

  // ── Shared input classes ─────────────────────────────────────────────────
  const inputBase = 'w-full px-3.5 py-2.5 border rounded-lg text-[14px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 transition-all';
  const inputNormal = `${inputBase} border-slate-200 focus:ring-indigo-500/30 focus:border-indigo-400`;
  const inputError  = `${inputBase} border-red-300 focus:ring-red-500/20 focus:border-red-400`;

  return (
    <div className="ws-modal" dir={direction}>

      {/* ── Fixed tooltip: disabled Continue ─────────────────────────────── */}
      {showTooltip && !canContinue && (
        <div
          style={{
            position: 'fixed',
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translate(-50%, -100%)',
            zIndex: 99999,
            pointerEvents: 'none',
          }}
          className="bg-slate-800 text-white text-[12px] px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg"
          dir={direction}
        >
          {c.tooltipMsg}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800" />
        </div>
      )}

      {/* ── Fixed tooltip: "Why recommended?" ───────────────────────────── */}
      {hoveredWhyId && (() => {
        const opt = useCases.find(o => o.id === hoveredWhyId);
        if (!opt?.why) return null;
        return (
          <div
            style={{
              position: 'fixed',
              top: whyPos.top,
              left: whyPos.left,
              transform: 'translate(-50%, -100%)',
              zIndex: 99998,
              pointerEvents: 'none',
              maxWidth: '260px',
            }}
            className="bg-slate-800 text-white text-[12px] px-3 py-2 rounded-lg shadow-lg leading-relaxed"
            dir={direction}
          >
            <div className="font-semibold text-indigo-300 mb-0.5">{c.whyTitle}</div>
            {opt.why}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800" />
          </div>
        );
      })()}

      {/* ── Header — always LTR: logo LEFT, bars RIGHT ───────────────────── */}
      <div
        className="flex items-center justify-between px-8 py-4 border-b border-slate-100 shrink-0"
        dir="ltr"
      >
        <img src={nexusBlackLogo} alt="Nexus" className="h-10 w-auto object-contain" />
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-[3px] rounded-full transition-colors duration-500 ${
                i <= step ? 'bg-indigo-500' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="ws-content">

        {/* ── Step 0: Welcome + Org form ─────────────────────────────────── */}
        {step === 0 && (
          <>
            <div className="mb-7">
              <h1 className="text-[26px] font-bold text-indigo-600 leading-tight mb-2">
                {c.welcomeTitle(firstName)}
              </h1>
              <p className="text-[14px] text-slate-500 leading-relaxed">
                {c.welcomeSubtitle}
              </p>
            </div>

            <div className="space-y-4">
              {/* Org name */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  {c.orgNameLabel}
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder={c.orgNamePlaceholder}
                  className={inputNormal}
                />
              </div>

              {/* Website + validation */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  {c.websiteLabel}
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={e => { setWebsite(e.target.value); validateWebsite(e.target.value); }}
                  onBlur={() => validateWebsite(website)}
                  placeholder={c.websitePlaceholder}
                  dir="ltr"
                  className={websiteError ? inputError : inputNormal}
                />
                {websiteError && (
                  <p className="text-[12px] text-red-500 mt-1">{c.websiteError}</p>
                )}
              </div>

              {/* Business description */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  {c.businessLabel}
                </label>
                <textarea
                  value={businessDesc}
                  onChange={e => setBusinessDesc(e.target.value)}
                  rows={4}
                  placeholder={c.businessPlaceholder}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-[14px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none leading-relaxed"
                />
              </div>
            </div>
          </>
        )}

        {/* ── Step 1: Solutions — 2-column grid ─────────────────────────── */}
        {step === 1 && (
          <>
            <h2 className="text-[21px] font-semibold text-slate-900 leading-snug mb-1.5">
              {c.step1Title}
            </h2>
            <p className="text-[13px] text-slate-400 mb-5">{c.step1Sub}</p>

            <div className="grid grid-cols-2 gap-2">
              {[
                ...useCases.filter(o => primarySuggested.includes(o.id)),
                ...useCases.filter(o => !primarySuggested.includes(o.id)),
              ].map(option => {
                const isSelected   = primarySelected.includes(option.id);
                const isSuggested  = primarySuggested.includes(option.id);
                const isNotSure    = option.id === 'not_sure';

                return (
                  <div
                    key={option.id}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() =>
                      setPrimarySelected(prev =>
                        prev.includes(option.id)
                          ? prev.filter(x => x !== option.id)
                          : [...prev, option.id]
                      )
                    }
                    onKeyDown={e => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setPrimarySelected(prev =>
                          prev.includes(option.id)
                            ? prev.filter(x => x !== option.id)
                            : [...prev, option.id]
                        );
                      }
                    }}
                    className={`${isNotSure ? 'col-span-2' : ''} cursor-pointer text-start px-4 py-3 rounded-lg border text-[14px] transition-all select-none ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Checkbox square */}
                      <div className={`w-4 h-4 rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-all ${
                        isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                      }`}>
                        {isSelected && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      <span className="flex-1 leading-tight">{option.label}</span>

                      {/* Suggested badge + why info button */}
                      {isSuggested && option.why && (
                        <div className="flex items-center gap-1.5 shrink-0 ms-auto">
                          <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full">
                            {c.suggested}
                          </span>
                          {/* Info button — stops click from toggling option */}
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={e => e.stopPropagation()}
                            onMouseEnter={e => handleWhyEnter(option.id, e)}
                            onMouseLeave={() => setHoveredWhyId(null)}
                            className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-500 text-[10px] font-bold flex items-center justify-center hover:bg-indigo-200 transition-colors leading-none"
                          >
                            ?
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Step 2: User details ───────────────────────────────────────── */}
        {step === 2 && (
          <>
            <div className="mb-7">
              <h2 className="text-[21px] font-semibold text-slate-900 leading-snug mb-1.5">
                {c.step2Title}
              </h2>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                {c.step2Sub}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  {c.phoneLabel}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder={c.phonePlaceholder}
                  dir="ltr"
                  className={inputNormal}
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  {c.roleLabel}
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  placeholder={c.rolePlaceholder}
                  className={inputNormal}
                />
              </div>
            </div>
          </>
        )}

      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="ws-footer-between">

        {/* Back button — hidden on step 0 */}
        {step > 0 ? (
          <button
            onClick={handleBack}
            className="text-[14px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1.5"
          >
            <BackArrow />
            {c.back}
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          {/* Skip — only on steps 0 and 1 */}
          {step < TOTAL_STEPS - 1 && (
            <button
              onClick={handleSkip}
              className="text-[14px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              {c.skip}
            </button>
          )}

          {/* Continue / Finish — tooltip when disabled */}
          <button
            ref={btnRef}
            onClick={handleNext}
            onMouseEnter={handleContinueEnter}
            onMouseLeave={() => setShowTooltip(false)}
            disabled={!canContinue}
            className={`px-6 py-2.5 text-[14px] font-semibold rounded-lg transition-colors ${
              canContinue
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {step < TOTAL_STEPS - 1 ? c.continue : c.finish}
          </button>
        </div>
      </div>

    </div>
  );
}
