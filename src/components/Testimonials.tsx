import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

// Optimized local images - downloaded and converted to WebP
const imageColumns = [
  {
    images: [
      { type: 'placeholder' },
      { type: 'image', src: '/testimonials/person-1.webp' },
      { type: 'image', src: '/testimonials/person-2.webp' },
    ],
    stagger: 'translate-y-10',
  },
  {
    images: [
      { type: 'placeholder' },
      { type: 'image', src: '/testimonials/person-3.webp' },
      { type: 'image', src: '/testimonials/person-4.webp' },
    ],
    stagger: '-translate-y-5',
  },
  {
    images: [
      { type: 'placeholder' },
      { type: 'image', src: '/testimonials/person-5.webp' },
      { type: 'placeholder' },
    ],
    stagger: 'translate-y-16',
  },
  {
    images: [
      { type: 'placeholder' },
      { type: 'image', src: '/testimonials/person-6.webp' },
      { type: 'image', src: '/testimonials/person-7.webp' },
    ],
    stagger: '-translate-y-10',
  },
  {
    images: [
      { type: 'image', src: '/testimonials/person-8.webp' },
      { type: 'placeholder' },
      { type: 'image', src: '/testimonials/person-9.webp' },
    ],
    stagger: '-translate-y-5',
    responsive: 'hidden md:flex',
  },
  {
    images: [
      { type: 'placeholder' },
      { type: 'image', src: '/testimonials/person-10.webp' },
      { type: 'placeholder' },
    ],
    stagger: 'translate-y-5',
    responsive: 'hidden md:flex',
  },
  {
    images: [
      { type: 'image', src: '/testimonials/person-11.webp' },
      { type: 'image', src: '/testimonials/person-12.webp' },
      { type: 'placeholder' },
    ],
    stagger: 'translate-y-10',
    responsive: 'hidden lg:flex',
  },
  {
    images: [
      { type: 'placeholder' },
      { type: 'image', src: '/testimonials/person-13.webp' },
      { type: 'image', src: '/testimonials/person-14.webp' },
    ],
    stagger: 'translate-y-16',
    responsive: 'hidden lg:flex',
  },
];

export default function Testimonials() {
  const { t, direction } = useLanguage();

  return (
    <section className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center py-20 bg-white">
      {/* Vertical Grid Lines Background */}
      <div className="absolute inset-0 z-0 flex justify-center pointer-events-none opacity-30 overflow-hidden">
        <div className="flex space-x-24 h-full max-w-full">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="w-px h-full bg-gradient-to-b from-transparent via-stripe-purple/20 to-transparent"
            />
          ))}
        </div>
      </div>

      {/* Diagonal Bottom Background */}
      <div
        className="absolute bg-stripe-blue z-0"
        style={{
          top: 'auto',
          left: 0,
          right: 0,
          bottom: 0,
          height: '400px',
          clipPath: direction === 'rtl'
            ? 'polygon(0 0, 100% 100px, 100% 100%, 0 100%)'
            : 'polygon(0 100px, 100% 0, 100% 100%, 0 100%)',
        }}
      >
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-stripe-purple/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-stripe-cyan/10 rounded-full blur-3xl" />
      </div>

      {/* Image Grid */}
      <div className="relative z-10 w-full max-w-7xl px-6 mb-16">
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 items-center">
          {imageColumns.map((column, colIndex) => (
            <div
              key={colIndex}
              className={`flex flex-col gap-4 ${column.stagger} ${column.responsive || ''}`}
            >
              {column.images.map((item, imgIndex) => (
                item.type === 'placeholder' ? (
                  <div
                    key={imgIndex}
                    className="w-full aspect-square bg-gradient-to-br from-stripe-purple/5 via-stripe-blue/5 to-stripe-cyan/5 rounded-2xl border border-slate-100"
                  />
                ) : (
                  <img
                    key={imgIndex}
                    src={item.src}
                    alt="Professional portrait"
                    className="w-full aspect-square object-cover rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg hover:scale-[1.02] transition-all duration-300"
                    loading="lazy"
                  />
                )
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Text Content */}
      <div className="relative z-20 text-center max-w-2xl px-6">
        <span className="inline-block px-4 py-1 rounded-full bg-stripe-purple/10 text-stripe-purple text-sm font-semibold mb-6 uppercase tracking-wider">
          {t.testimonials.badge}
        </span>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-2">
          <span className="text-slate-900">{t.testimonials.title}</span>
          <br />
          <span className="bg-gradient-to-r from-stripe-purple via-stripe-blue to-stripe-cyan bg-clip-text text-transparent">
            {t.testimonials.subtitle}
          </span>
        </h1>
        <p className="text-lg text-slate-600 mt-6 leading-relaxed">
          {t.testimonials.description}
        </p>
        <div className="mt-10 flex flex-col items-center">
          <button className="bg-stripe-purple hover:bg-stripe-purple/90 text-white px-8 py-4 rounded-lg font-semibold flex items-center hover:shadow-xl hover:shadow-stripe-purple/30 transition-all duration-300 group">
            {t.testimonials.readSuccessStories}
            <ArrowRight className={`ml-2 group-hover:translate-x-1 transition-transform ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}
