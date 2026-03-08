/**
 * StoryGiftCards — adapted from nexus-wallet GiftCardsPage.tsx
 * Section 3: "גיפט קארד מהמותגים האהובים עליך"
 * 3D rotating carousel of gift cards with pulse + notification effects.
 */
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

const giftCards = [
  { name: 'AIRBNB',    value: '$25',  gradient: 'from-[#FF5A5F] to-[#FF385C]', logo: '/airbnb-logo.png' },
  { name: 'NIKE',      value: '$50',  gradient: 'from-white to-gray-50',        logo: '/nike-logo.png' },
  { name: 'GARMIN',    value: '$100', gradient: 'from-blue-600 to-red-500',     logo: '/garmin-logo.png' },
  { name: 'CARREFOUR', value: '$30',  gradient: 'from-blue-500 to-cyan-400',    logo: '/carrefour-logo.png' },
  { name: 'BUDGET',    value: '$75',  gradient: 'from-blue-600 to-orange-500',  logo: '/budget-logo.png' },
  { name: 'CASTRO',    value: '$40',  gradient: 'from-gray-800 to-slate-700',   logo: '/castro-logo.png' },
];

const redeemNames = ['Sarah', 'Michael', 'Emma', 'David', 'Sophie', 'Alex'];

interface Notification {
  id: number;
  name: string;
}

export default function StoryGiftCards() {
  const { language } = useLanguage();
  const he = language === 'he';

  const [cardSlots, setCardSlots] = useState([0, 1, 2, 3, 4, 5]);
  const [isPulsing, setIsPulsing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const notificationIdRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  const slots = giftCards.map((_, i) => ({
    angle: (360 / giftCards.length) * i,
    isFront: i === 0,
  }));

  const rotateCards = useCallback(() => {
    setCardSlots((prev) => {
      const newSlots = [...prev];
      const lastCard = newSlots.pop()!;
      newSlots.unshift(lastCard);

      setTimeout(() => {
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 500);
      }, 1200);

      return newSlots;
    });
  }, []);

  // Auto-rotate
  useEffect(() => {
    const firstTimeout = setTimeout(() => rotateCards(), 800);
    intervalRef.current = window.setInterval(() => rotateCards(), 2800);
    return () => {
      clearTimeout(firstTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [rotateCards]);

  // Notification on pulse
  useEffect(() => {
    if (isPulsing) {
      const name = redeemNames[Math.floor(Math.random() * redeemNames.length)];
      const n: Notification = { id: notificationIdRef.current++, name };
      setNotifications((prev) => [...prev, n]);
      setTimeout(() => {
        setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      }, 2500);
    }
  }, [isPulsing]);

  return (
    <div className="w-full flex flex-col items-center justify-center px-6 relative overflow-hidden py-8" style={{ minHeight: 520 }}>
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className={`mb-8 text-2xl font-semibold leading-relaxed w-full max-w-sm ${he ? 'text-right' : 'text-left'}`}
        style={{ color: '#635bff' }}
      >
        <div>{he ? 'בחר גיפט קארד מהמותגים האהובים עליך' : 'Choose gift cards from your favorite brands'}</div>
        <div className="text-base font-normal mt-1 text-slate-500">
          {he ? 'ומשל את הקאשבק שצברת' : 'and redeem the cashback you earned'}
        </div>
      </motion.div>

      {/* 3D Carousel */}
      <div className="relative w-full max-w-sm" style={{ height: 320 }}>
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full"
          style={{ perspective: '1200px', perspectiveOrigin: 'center center' }}
        >
          <div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
            {giftCards.map((card, cardIndex) => {
              const slotIndex = cardSlots.indexOf(cardIndex);
              const slot = slots[slotIndex];
              const radius = 200;

              const shouldPulse = slot.isFront && isPulsing;
              const cardScale = shouldPulse ? 1.15 : 0.85;
              const cardOpacity = slot.isFront ? 1 : slotIndex === 1 || slotIndex === 5 ? 0.6 : 0.3;

              return (
                <div
                  key={`card-${cardIndex}`}
                  className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-gradient-to-br ${card.gradient} shadow-2xl flex items-center justify-center`}
                  style={{
                    width: 240,
                    height: 150,
                    transformStyle: 'preserve-3d',
                    transform: `rotateY(${slot.angle}deg) translateZ(${radius}px) scale(${cardScale})`,
                    opacity: cardOpacity,
                    zIndex: slot.isFront ? 10 : 1,
                    transition: shouldPulse
                      ? 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                      : 'transform 1.2s ease-in-out, opacity 0.8s ease',
                  }}
                >
                  {card.logo && !imageErrors.has(cardIndex) ? (
                    <img
                      src={card.logo}
                      alt={card.name}
                      className="w-28 h-auto object-contain"
                      onError={() => setImageErrors((prev) => new Set(prev).add(cardIndex))}
                    />
                  ) : (
                    <div className="text-gray-400 text-xl font-bold">{card.name}</div>
                  )}
                  <div
                    className={`absolute bottom-3 right-4 text-lg font-bold ${card.name === 'NIKE' ? 'text-black' : 'text-white'}`}
                  >
                    {card.value}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notifications */}
        {notifications.map((n, i) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-4 bg-white rounded-full px-3 py-1.5 shadow-md border border-slate-100 flex items-center gap-2 z-20 pointer-events-none"
            style={{ top: `${16 + i * 44}px` }}
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white text-[8px] font-bold">
              {n.name.charAt(0)}
            </div>
            <span className="text-[10px] font-medium text-slate-700">{n.name} redeemed!</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
