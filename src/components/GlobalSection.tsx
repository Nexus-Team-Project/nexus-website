import { ArrowRight } from 'lucide-react';
import CardStackAnimation from './CardStackAnimation';
import { useLanguage } from '../i18n/LanguageContext';

export default function GlobalSection() {
  const { t, direction } = useLanguage();

  return (
    <section className="relative py-20 md:py-48 overflow-x-hidden">
      {/* Gray background for top half */}
      <div className="absolute inset-0 bg-nx-light" style={{ bottom: '50%' }} />

      {/* White background for bottom half */}
      <div className="absolute inset-0 bg-white" style={{ top: '50%' }} />

      {/* Diagonal slanted background - both top and bottom */}
      <div
        className="absolute bg-nx-blue"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          clipPath: direction === 'rtl'
            ? 'polygon(0 0, 100% 100px, 100% 100%, 0 calc(100% - 100px))'
            : 'polygon(0 100px, 100% 0, 100% calc(100% - 100px), 0 100%)',
        }}
      >
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-nx-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-nx-cyan/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-nx-cyan font-semibold text-sm uppercase tracking-wider mb-4">
              {t.globalSection.globalScale}
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight mb-6 leading-tight">
              {t.globalSection.backboneTitle}
            </h2>
            <p className="text-lg text-white/60 leading-relaxed mb-8">
              {t.globalSection.backboneDesc}
            </p>

            <div className="flex flex-wrap gap-4">
              <a
                href="#"
                className="inline-flex items-center gap-2 text-nx-cyan hover:text-white text-sm font-medium transition-colors"
              >
                {t.globalSection.readGlobalGuide} <ArrowRight size={14} className={direction === 'rtl' ? 'scale-x-[-1]' : ''} />
              </a>
            </div>
          </div>

          {/* Card Stack Animation */}
          <div className="relative flex items-center justify-center">
            <CardStackAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}
