import { useState, useEffect } from 'react';

const STEPS = [
  'Setting up your Nexus environment',
  'Connecting benefits infrastructure',
  'Preparing your workspace',
  'Generating dashboard preview',
];

interface SetupAnimationProps {
  onComplete: () => void;
}

export default function SetupAnimation({ onComplete }: SetupAnimationProps) {
  const [done, setDone] = useState<number[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let idx = 0;
    const tick = () => {
      if (idx >= STEPS.length) return;
      const current = idx;
      idx++;
      setDone(prev => [...prev, current]);
      setActive(idx);
      if (idx < STEPS.length) {
        setTimeout(tick, 800);
      } else {
        setTimeout(onComplete, 600);
      }
    };
    const t = setTimeout(tick, 500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const progress = (done.length / STEPS.length) * 100;

  return (
    <div className="ws-modal">
      {/* Spinning icon */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="white" strokeOpacity="0.25" strokeWidth="3"/>
            <path d="M21 12a9 9 0 00-9-9" stroke="white" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h2 className="text-[17px] font-bold text-gray-900">Preparing your workspace</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">Almost there…</p>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4 mb-8">
        {STEPS.map((s, i) => {
          const isDone = done.includes(i);
          const isActive = active === i && !isDone;
          return (
            <div key={s} className="flex items-center gap-3">
              {/* Icon */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-400 ${
                  isDone
                    ? 'bg-emerald-500'
                    : isActive
                    ? 'border-2 border-indigo-500 bg-indigo-50'
                    : 'border-2 border-gray-200 bg-white'
                }`}
              >
                {isDone ? (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : isActive ? (
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                ) : null}
              </div>

              {/* Label */}
              <span
                className={`text-[13px] transition-colors duration-300 ${
                  isDone
                    ? 'text-gray-800 font-medium'
                    : isActive
                    ? 'text-indigo-600 font-semibold'
                    : 'text-gray-400'
                }`}
              >
                {s}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
