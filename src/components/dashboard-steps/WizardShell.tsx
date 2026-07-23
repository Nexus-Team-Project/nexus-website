// WizardShell - shared chrome for the "send a gift" dashboard step mocks.
// Renders a fixed 1200x820 desktop-sized app frame (RTL, light theme) with the
// gift-flow header (title + balance chip) and the 5-step progress indicator.
// Purely presentational: no router, no state, no side effects. Steps pass their
// screen content as children and mark which step is active.
import type { ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';

// Intrinsic desktop dimensions every mock renders at. A carousel scales the
// whole frame with a CSS transform, so these must stay fixed (non-responsive).
export const STEP_WIDTH = 1200;
export const STEP_HEIGHT = 820;

// The real wizard order, derived from each page's navigation:
// event -> brands (מתנה) -> greeting (ברכה) -> recipients (נמענים) -> summary.
const STEPS = [
  { number: 1, label: 'אירוע' },
  { number: 2, label: 'מתנה' },
  { number: 3, label: 'ברכה' },
  { number: 4, label: 'נמענים' },
  { number: 5, label: 'סיכום' },
];

interface WizardShellProps {
  title: string;
  subtitle: string;
  activeStep: number;
  children: ReactNode;
}

const WizardShell = ({ title, subtitle, activeStep, children }: WizardShellProps) => {
  return (
    <div
      dir="rtl"
      style={{ width: STEP_WIDTH, height: STEP_HEIGHT }}
      className="overflow-hidden bg-[#f6f9fc] text-slate-900 font-sans"
    >
      <div className="h-full overflow-hidden p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-full text-slate-400">
              <ArrowRight className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
              <p className="text-slate-500 mt-1">{subtitle}</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-slate-100 rounded-full text-sm font-medium">
            יתרה: 5,200 ₪
          </div>
        </div>

        {/* Step Progress */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            {STEPS.map((step, index) => {
              const active = step.number === activeStep;
              const done = step.number < activeStep;
              return (
                <div key={step.number} className="flex items-center">
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all ${
                        active
                          ? 'border-primary text-primary bg-primary/10'
                          : done
                            ? 'border-primary bg-primary text-white'
                            : 'border-slate-300 text-slate-500'
                      }`}
                    >
                      {done ? <Check className="w-5 h-5" /> : step.number}
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        active ? 'text-primary' : 'text-slate-500'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="w-12 lg:w-20 h-[2px] bg-slate-200 mx-2" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Screen content */}
        {children}
      </div>
    </div>
  );
};

export default WizardShell;
