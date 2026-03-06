import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import AnimatedGradient from './AnimatedGradient';
import { useAnalytics } from '../hooks/useAnalytics';
import { MARKETING } from '../lib/analyticsEvents';

export default function Hero() {
  const { t, direction, language } = useLanguage();
  const { track } = useAnalytics();

  return (
    <section className="relative min-h-[85vh] md:min-h-screen flex items-center overflow-visible">
      <AnimatedGradient
        clipPath={direction === 'rtl'
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 65%)'
          : 'polygon(0 0, 100% 0, 100% 65%, 0 100%)'
        }
      />

      {/* Hero Mockup - English: right, Hebrew: left */}
      <div
        className={`absolute hidden lg:block z-50 ${direction === 'rtl' ? 'w-4/5 max-w-6xl top-20' : 'w-1/2 max-w-3xl top-32 right-0'}`}
        style={direction === 'rtl' ? { left: '-27%' } : {}}
      >
        <picture>
          <source
            srcSet={direction === 'rtl' ? '/hero-mockup-he.webp' : '/hero-mockup-en.webp'}
            type="image/webp"
          />
          <img
            src={direction === 'rtl' ? '/hero-mockup-he.png' : '/hero-mockup-en.png'}
            alt="Payment Dashboard Interface"
            className="w-full h-auto drop-shadow-2xl"
            loading="eager"
            style={{
              imageRendering: '-webkit-optimize-contrast',
            }}
          />
        </picture>
      </div>

      <div className="relative z-10 w-full">
        <div className="max-w-7xl mx-auto px-6 pt-32 pb-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Text content */}
            <div className={direction === 'rtl' ? 'lg:order-1' : 'lg:order-1'}>
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-8">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-white font-medium">New: Revenue Recognition is here</span>
                <ArrowRight size={12} className={`text-white/70 ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
              </div>

              <h1 className="text-5xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight mb-6 drop-shadow-lg">
                {t.hero.title}
              </h1>

              <p className="text-lg text-white/90 leading-relaxed max-w-lg mb-10 drop-shadow">
                {t.hero.subtitle}
              </p>

              <div className="flex flex-nowrap gap-2 sm:gap-4">
                <Link
                  to={language === 'he' ? '/he/signup' : '/signup'}
                  className="group inline-flex items-center gap-2 bg-stripe-purple hover:bg-stripe-purple/85 text-white font-semibold px-5 sm:px-8 py-3.5 sm:py-4 rounded-lg transition-all duration-300 hover:shadow-xl hover:shadow-stripe-purple/30 sm:hover:px-10 text-sm"
                  onClick={() => track(MARKETING.HERO_CTA_CLICKED, 'MARKETING', { button_text: t.hero.startNow, page_path: window.location.pathname })}
                >
                  {t.hero.startNow}
                  <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                    <ArrowRight size={16} className={`inline ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
                  </span>
                </Link>
                <Link
                  to={language === 'he' ? '/he/login' : '/login'}
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3.5 sm:py-4 border border-gray-300 rounded-lg shadow-sm bg-white text-xs sm:text-sm font-bold text-stripe-dark hover:bg-gray-50 hover:border-stripe-purple transition-colors whitespace-nowrap"
                >
                  {t.navbar.signIn}
                </Link>
              </div>
            </div>

            {/* Empty space for image */}
            <div className={`hidden lg:block ${direction === 'rtl' ? 'lg:order-2' : 'lg:order-2'}`}></div>
          </div>
        </div>
      </div>
    </section>
  );
}
