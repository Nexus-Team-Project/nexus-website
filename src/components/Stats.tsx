import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const getStats = (t: any) => [
  { value: 135, suffix: '+', label: t.stats.currenciesAndPayment },
  { value: 99.99, suffix: '%', label: t.stats.uptimeSLA, decimals: 2 },
  { value: 160, suffix: '+', label: t.stats.benefitsPartners },
];

export default function Stats() {
  const { t } = useLanguage();
  const stats = getStats(t);

  return (
    <section className="py-24 bg-stripe-light">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <StatCounter
              key={stat.label}
              value={stat.value}
              suffix={stat.suffix}
              label={stat.label}
              decimals={stat.decimals}
              delay={index * 100}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCounter({
  value,
  suffix,
  label,
  decimals = 0,
  delay = 0
}: {
  value: number;
  suffix: string;
  label: string;
  decimals?: number;
  delay?: number;
}) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);

          setTimeout(() => {
            const duration = 2000;
            const steps = 60;
            const increment = value / steps;
            let current = 0;

            const timer = setInterval(() => {
              current += increment;
              if (current >= value) {
                setCount(value);
                clearInterval(timer);
              } else {
                setCount(current);
              }
            }, duration / steps);

            return () => clearInterval(timer);
          }, delay);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [value, hasAnimated, delay]);

  return (
    <div
      ref={ref}
      className="text-center animate-fade-in-up opacity-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-stripe-purple to-stripe-cyan bg-clip-text text-transparent mb-3">
        {decimals > 0 ? count.toFixed(decimals) : Math.floor(count)}
        {suffix}
      </div>
      <div className="text-sm text-stripe-gray font-medium">{label}</div>
    </div>
  );
}
