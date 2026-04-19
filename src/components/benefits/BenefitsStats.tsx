import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

interface Stat {
  value: number;
  suffix: string;
  labelHe: string;
  labelEn: string;
}

const STATS: Stat[] = [
  { value: 50,   suffix: '+', labelHe: 'ארגונים פעילים',   labelEn: 'Active Organizations' },
  { value: 300,  suffix: '+', labelHe: 'ספקי הטבות',       labelEn: 'Benefit Providers' },
  { value: 100,  suffix: 'K+', labelHe: 'חברי קהילה',     labelEn: 'Community Members' },
  { value: 2,    suffix: 'M+ ₪', labelHe: 'חיסכון חודשי', labelEn: 'Monthly Savings' },
];

function AnimatedCounter({ target, suffix }: { target: number; suffix: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true;
          const duration = 1200;
          const start = performance.now();
          const step = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref} className="text-5xl lg:text-6xl font-black text-nx-primary">
      {count}{suffix}
    </div>
  );
}

export default function BenefitsStats() {
  const { language } = useLanguage();
  const he = language === 'he';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
      {STATS.map((stat) => (
        <div key={stat.labelEn} className="text-center">
          <AnimatedCounter target={stat.value} suffix={stat.suffix} />
          <div className="mt-2 text-sm text-slate-500 font-medium">
            {he ? stat.labelHe : stat.labelEn}
          </div>
        </div>
      ))}
    </div>
  );
}
