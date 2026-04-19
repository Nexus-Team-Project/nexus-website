import { useLanguage } from '../../i18n/LanguageContext';

const PROVIDERS = [
  { name: 'Golf & Co',      logo: '/brands/golf.png',           bg: '#FFF59D' },
  { name: 'American Eagle',  logo: '/brands/american-eagle.png', bg: '#1a3a7a' },
  { name: 'Rami Levy',       logo: '/brands/rami-levy.png',      bg: '#B3171D' },
  { name: 'Mango',           logo: '/brands/mango.png',          bg: '#FFFFFF' },
  { name: 'Samsung',         logo: '/brands/samsung.png',         bg: '#1428a0' },
  { name: 'Foot Locker',     logo: '/brands/foot-locker.png',    bg: '#FFFFFF' },
  { name: 'Carrefour',       logo: '/brands/carrefour.png',      bg: '#FFFFFF' },
  { name: 'Castro',          logo: '/brands/castro-home.png',     bg: '#f8f4f0' },
  { name: 'Sacks',           logo: '/brands/sacks.png',          bg: '#FFFFFF' },
  { name: 'Yves Rocher',     logo: '/brands/yves-rocher.png',    bg: '#2d5e2a' },
  { name: 'Billabong',       logo: '/brands/billabong.png',      bg: '#FFFFFF' },
  { name: 'Magnolia',        logo: '/brands/magnolia.png',       bg: '#FFFFFF' },
];

export default function BenefitsProviderGrid() {
  const { language } = useLanguage();
  const he = language === 'he';

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
      {PROVIDERS.map((p) => (
        <div
          key={p.name}
          className="provider-logo flex items-center justify-center rounded-xl border border-slate-200 bg-white p-4 h-20 hover:shadow-md hover:border-nx-primary/30 transition-all"
        >
          <img
            src={p.logo}
            alt={p.name}
            className="max-h-10 max-w-full object-contain"
            loading="lazy"
          />
        </div>
      ))}
      {/* "+300" placeholder */}
      <div className="provider-logo flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 h-20">
        <span className="text-slate-400 font-bold text-sm">
          {he ? '+300 נוספים' : '+300 more'}
        </span>
      </div>
    </div>
  );
}
