import { useLanguage } from '../../i18n/LanguageContext';

const STEPS_HE = [
  { num: '1', title: 'התחברו',  desc: 'צרו קשר ונבנה יחד את מועדון ההטבות המושלם לארגון שלכם.' },
  { num: '2', title: 'התאימו',  desc: 'בחרו הטבות, הוסיפו הטבות ייחודיות, ומתגו את הפלטפורמה בצבעי הארגון.' },
  { num: '3', title: 'השיקו',   desc: 'המועדון מוכן — חברי הקהילה מתחילים לחסוך ולהתחבר לארגון.' },
];

const STEPS_EN = [
  { num: '1', title: 'Connect',    desc: 'Get in touch and we\'ll design the perfect benefits club for your organization.' },
  { num: '2', title: 'Customize',  desc: 'Choose benefits, add your own, and brand the platform with your identity.' },
  { num: '3', title: 'Launch',     desc: 'Your club is ready — community members start saving and engaging.' },
];

export default function BenefitsHowItWorks() {
  const { language } = useLanguage();
  const he = language === 'he';
  const steps = he ? STEPS_HE : STEPS_EN;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative">
      {/* Connecting line (desktop only) */}
      <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-violet-400/40 via-violet-400/60 to-violet-400/40" />

      {steps.map((step, i) => (
        <div
          key={step.num}
          className="step-card flex flex-col items-center text-center"
        >
          {/* Number circle */}
          <div
            className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center mb-6"
            style={{
              background: 'linear-gradient(135deg, #635bff, #7c3aed)',
              boxShadow: '0 8px 24px rgba(99,91,255,0.35)',
            }}
          >
            <span className="text-white text-2xl font-black">{step.num}</span>
          </div>

          <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
          <p className="text-white/70 text-sm leading-relaxed max-w-xs">{step.desc}</p>
        </div>
      ))}
    </div>
  );
}
