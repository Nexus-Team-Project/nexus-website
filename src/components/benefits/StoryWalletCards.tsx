/**
 * StoryWalletCards — adapted from nexus-wallet WalletCardsPage.tsx
 * Section 1: "נרכז לך את כל ההטבות במקום אחד"
 * Dark phone mockup with floating wallet brand cards.
 */
import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

const walletCards = [
  { name: 'Golf & Co',      logo: '/brands/golf.png',           bg: '#FFF59D', textDark: true,  logoW: 'w-11', logoMaxH: 28 },
  { name: 'American Eagle',  logo: '/brands/american-eagle.png', bg: '#1a3a7a', textDark: false, logoW: 'w-16', logoMaxH: 40 },
  { name: 'Rami Levy',       logo: '/brands/rami-levy.png',      bg: '#B3171D', textDark: false, logoW: 'w-16', logoMaxH: 40 },
  { name: 'Mango',           logo: '/brands/mango.png',          bg: '#FFFFFF', textDark: true,  logoW: 'w-20', logoMaxH: 48 },
  { name: 'Foot Locker',     logo: '/brands/foot-locker.png',    bg: '#D3D3D3', textDark: true,  logoW: 'w-16', logoMaxH: 40 },
];

// Preload logos
if (typeof window !== 'undefined') {
  walletCards.forEach(({ logo }) => { const i = new Image(); i.src = logo; });
}

export default function StoryWalletCards() {
  const { language } = useLanguage();
  const he = language === 'he';
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const sheenRefs = useRef<(HTMLDivElement | null)[]>([]);

  return (
    <div
      className="w-full flex flex-col items-center justify-center px-6 relative overflow-hidden py-8"
      style={{ minHeight: 560 }}
    >
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className={`mb-6 w-full max-w-sm z-10 relative ${he ? 'text-right' : 'text-left'}`}
      >
        <h2 className="text-2xl font-semibold leading-relaxed text-slate-900">
          {he ? 'נרכז לך את כל ההטבות במקום אחד' : "All your benefits in one place"}
        </h2>
        <p className="text-base font-normal mt-1 text-slate-500">
          {he ? 'כל הכרטיסים שלך, תמיד איתך' : 'All your cards, always with you'}
        </p>
      </motion.div>

      {/* Phone mockup */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.92 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
        className="relative z-10"
      >
        {/* Subtle pill glow */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[90px] z-0"
          style={{ width: 280, height: 400, background: 'rgba(99, 91, 255, 0.15)', filter: 'blur(40px)' }}
        />

        {/* Phone frame */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
          className="relative z-10"
          style={{
            width: 260,
            aspectRatio: '9 / 18.8',
            borderRadius: 36,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04)), #0b0f1a',
            padding: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 30px 80px rgba(7,10,20,0.35)',
          }}
        >
          {/* Inner frame highlight */}
          <div
            className="absolute pointer-events-none"
            style={{ inset: 7, borderRadius: 29, border: '1px solid rgba(255,255,255,0.08)' }}
          />

          {/* Screen */}
          <div
            className="w-full h-full relative overflow-hidden"
            style={{
              borderRadius: 28,
              background: 'radial-gradient(120% 120% at 40% 20%, rgba(99,91,255,0.18), transparent 55%), linear-gradient(180deg, #0a0b14, #121535)',
            }}
          >
            {/* Dot grid */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                maskImage: 'radial-gradient(70% 55% at 50% 25%, black 25%, transparent 70%)',
                opacity: 0.7,
              }}
            />

            {/* Notch */}
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-10"
              style={{
                width: 100, height: 22,
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '0 0 14px 14px',
                backdropFilter: 'blur(6px)',
              }}
            />

            {/* Top bar */}
            <div
              className="absolute top-8 left-3 right-3 flex items-center justify-between z-10"
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="grid place-items-center"
                  style={{
                    width: 20, height: 20, borderRadius: 999,
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    fontSize: 10,
                  }}
                >
                  👤
                </div>
                <span className="text-xs font-semibold" style={{ letterSpacing: 0.2 }}>Wallet</span>
              </div>
            </div>

            {/* Cards grid */}
            <div
              className="absolute left-3 right-3 z-[2] grid grid-cols-2 gap-2.5"
              style={{ top: 62, bottom: 14, paddingTop: 4, alignContent: 'start' }}
            >
              {walletCards.map((card, i) => (
                <motion.div
                  key={card.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.12, ease: 'easeOut' }}
                >
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 4.8, ease: 'easeInOut', delay: i * 0.13 }}
                    className="relative overflow-hidden flex items-center justify-center"
                    style={{
                      height: 64, borderRadius: 12, background: card.bg,
                      border: '1px solid rgba(255,255,255,0.10)',
                      boxShadow: '0 10px 18px rgba(0,0,0,0.18)',
                    }}
                  >
                    {/* Sheen overlay */}
                    <div
                      ref={(el) => { sheenRefs.current[i] = el; }}
                      className="absolute pointer-events-none"
                      style={{
                        inset: '-40%',
                        background: 'linear-gradient(120deg, transparent 35%, rgba(255,255,255,0.35) 45%, transparent 55%)',
                        animation: `walletSheen 3.2s ease-in-out infinite ${i * 0.4}s`,
                        opacity: 0.45,
                      }}
                    />

                    {/* Brand logo */}
                    {!imageErrors.has(i) ? (
                      <img
                        src={card.logo}
                        alt={card.name}
                        className={`${card.logoW} h-auto object-contain relative z-[1]`}
                        style={{ maxHeight: card.logoMaxH }}
                        onError={() => setImageErrors((prev) => new Set(prev).add(i))}
                      />
                    ) : (
                      <span
                        className="text-sm font-bold relative z-[1]"
                        style={{ color: card.textDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)' }}
                      >
                        {card.name}
                      </span>
                    )}
                  </motion.div>
                </motion.div>
              ))}

              {/* Add card (+) */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.4 + walletCards.length * 0.12, ease: 'easeOut' }}
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 4.8, ease: 'easeInOut', delay: walletCards.length * 0.13 }}
                  className="relative overflow-hidden flex items-center justify-center"
                  style={{
                    height: 64, borderRadius: 12,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px dashed rgba(255,255,255,0.18)',
                  }}
                >
                  <div
                    className="grid place-items-center"
                    style={{
                      width: 30, height: 30, borderRadius: 999,
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      fontSize: 16, color: 'rgba(255,255,255,0.9)',
                    }}
                  >
                    +
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Sheen keyframes */}
      <style>{`
        @keyframes walletSheen {
          0% { transform: translateX(-65%) rotate(8deg); }
          55% { transform: translateX(65%) rotate(8deg); }
          100% { transform: translateX(65%) rotate(8deg); }
        }
      `}</style>
    </div>
  );
}
