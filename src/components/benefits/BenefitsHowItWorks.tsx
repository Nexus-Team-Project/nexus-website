import { useEffect, useRef, useState } from 'react';
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
  const { language, direction } = useLanguage();
  const he = language === 'he';
  const isRtl = direction === 'rtl';
  const steps = he ? STEPS_HE : STEPS_EN;
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sequential fill animation: activate steps one by one
  useEffect(() => {
    if (!isVisible) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((_, i) => {
      timers.push(setTimeout(() => setActiveStep(i), 600 + i * 1000));
    });

    return () => timers.forEach(clearTimeout);
  }, [isVisible, steps.length]);

  return (
    <div ref={containerRef} className="relative">
      <style>{`
        @keyframes fillProgress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes circleReveal {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes checkAppear {
          0% { transform: scale(0) rotate(-45deg); opacity: 0; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes textSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .step-fill-circle {
          animation: circleReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .step-fill-text {
          animation: textSlideUp 0.4s ease-out forwards;
        }
        .step-pulse-ring {
          animation: pulseRing 1s ease-out forwards;
        }
      `}</style>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 relative">
        {/* Connecting line (desktop only) — background track */}
        <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-1 bg-white/10 rounded-full overflow-hidden">
          {/* Animated fill bar */}
          <div
            className="h-full rounded-full transition-all ease-out"
            style={{
              background: 'linear-gradient(90deg, #0d9488, #7c3aed, #0d9488)',
              width: activeStep >= 2 ? '100%' : activeStep >= 1 ? '50%' : activeStep >= 0 ? '0%' : '0%',
              transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              transitionDelay: activeStep >= 1 ? '0.3s' : '0s',
              boxShadow: activeStep >= 0 ? '0 0 12px rgba(99,91,255,0.5)' : 'none',
            }}
          />
        </div>

        {/* Mobile connecting line — vertical */}
        <div className="md:hidden absolute top-8 left-1/2 -translate-x-1/2 w-1 bg-white/10 rounded-full overflow-hidden" style={{ height: 'calc(100% - 64px)' }}>
          <div
            className="w-full rounded-full transition-all ease-out"
            style={{
              background: 'linear-gradient(180deg, #0d9488, #7c3aed, #0d9488)',
              height: activeStep >= 2 ? '100%' : activeStep >= 1 ? '50%' : activeStep >= 0 ? '0%' : '0%',
              transition: 'height 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              transitionDelay: activeStep >= 1 ? '0.3s' : '0s',
              boxShadow: activeStep >= 0 ? '0 0 12px rgba(99,91,255,0.5)' : 'none',
            }}
          />
        </div>

        {steps.map((step, i) => {
          const isActive = i <= activeStep;
          const isCurrent = i === activeStep;

          return (
            <div
              key={step.num}
              className="step-card flex flex-col items-center text-center relative"
            >
              {/* Number circle */}
              <div className="relative z-10 mb-6">
                {/* Pulse ring on activation */}
                {isCurrent && (
                  <div
                    className="absolute inset-0 rounded-full step-pulse-ring"
                    style={{ background: 'rgba(99,91,255,0.3)' }}
                  />
                )}

                {/* Circle background */}
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500"
                  style={{
                    background: isActive
                      ? 'linear-gradient(135deg, #0d9488, #7c3aed)'
                      : 'rgba(255,255,255,0.1)',
                    boxShadow: isActive
                      ? '0 8px 24px rgba(99,91,255,0.35)'
                      : 'inset 0 0 0 2px rgba(255,255,255,0.2)',
                    transform: isCurrent ? 'scale(1.1)' : 'scale(1)',
                  }}
                >
                  {isActive ? (
                    <span
                      className="text-white text-2xl font-black"
                      style={{
                        opacity: isActive ? 1 : 0,
                        transform: isActive ? 'scale(1)' : 'scale(0)',
                        transition: 'opacity 0.3s ease 0.2s, transform 0.3s ease 0.2s',
                      }}
                    >
                      {step.num}
                    </span>
                  ) : (
                    <span className="text-white/40 text-2xl font-black">{step.num}</span>
                  )}
                </div>
              </div>

              {/* Text content */}
              <div
                style={{
                  opacity: isActive ? 1 : 0.4,
                  transform: isActive ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'opacity 0.4s ease 0.3s, transform 0.4s ease 0.3s',
                }}
              >
                <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed max-w-xs">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
