import { CreditCard, CreditCard as CardIcon, Globe2, Layers, ArrowRight } from 'lucide-react';
import PaymentAnimation from './PaymentAnimation';
import WalletEditorCard from './WalletEditorCard';
import SpendingLimitsAnimation from './SpendingLimitsAnimation';
import BorderlessGlobe from './BorderlessGlobe';
import BorderHighlightCard from './BorderHighlightCard';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { MARKETING } from '../lib/analyticsEvents';

const giftCards = [
  { name: 'AIRBNB', value: '$25', gradient: 'from-[#FF5A5F] to-[#FF385C]', logo: '/airbnb-logo.png' },
  { name: 'NIKE', value: '$50', gradient: 'from-white to-gray-50', logo: '/nike-logo.png' },
  { name: 'GARMIN', value: '$100', gradient: 'from-blue-600 to-red-500', logo: '/garmin-logo.png' },
  { name: 'CARREFOUR', value: '$30', gradient: 'from-blue-500 to-cyan-400', logo: '/carrefour-logo.png' },
  { name: 'BUDGET', value: '$75', gradient: 'from-blue-600 to-orange-500', logo: '/budget-logo.png' },
  { name: 'CASTRO', value: '$40', gradient: 'from-gray-800 to-slate-700', logo: '/castro-logo.png' },
];

const redeemNames = ['Sarah', 'Michael', 'Emma', 'David', 'Sophie', 'Alex', 'Maria', 'James', 'Olivia', 'Daniel'];

interface Notification {
  id: number;
  name: string;
  avatarId: number;
}

function CircularCarouselCard({ isGlobeHovered, isMobileActive, onMobileClick }: { isGlobeHovered: boolean; isMobileActive?: boolean; onMobileClick?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationIdRef = useRef(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const { t } = useLanguage();

  // Track which card is in which slot (slot 0 is front position)
  // Initially: [0, 1, 2, 3, 4, 5] means card 0 in slot 0, card 1 in slot 1, etc.
  const [cardSlots, setCardSlots] = useState([0, 1, 2, 3, 4, 5]);

  // Fixed slot positions (angles)
  const slots = giftCards.map((_, i) => ({
    angle: (360 / giftCards.length) * i,
    isFront: i === 0, // Slot 0 is the front position
  }));

  // Function to rotate cards
  const rotateCards = useCallback(() => {
    // Move each card to the next slot (rotate right)
    setCardSlots(prev => {
      const newSlots = [...prev];
      const lastCard = newSlots.pop()!;
      newSlots.unshift(lastCard);

      // Trigger pulse after rotation animation completes
      setTimeout(() => {
        setIsPulsing(true);

        setTimeout(() => {
          setIsPulsing(false);
        }, 500);
      }, 1500);

      return newSlots;
    });
  }, []);

  const isActive = isHovered || !!isMobileActive;

  // Rotation interval - moves cards to next slot
  useEffect(() => {
    if (isActive) {
      // Trigger first rotation immediately
      rotateCards();

      // Then set interval for subsequent rotations
      intervalRef.current = window.setInterval(() => {
        rotateCards();
      }, 3000); // Rotate every 3 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, rotateCards]);

  // Show notification when card pulses
  useEffect(() => {
    if (isPulsing) {
      const randomName = redeemNames[Math.floor(Math.random() * redeemNames.length)];
      const randomAvatarId = Math.floor(Math.random() * 70) + 1; // Random avatar from 1-70
      const newNotification: Notification = {
        id: notificationIdRef.current++,
        name: randomName,
        avatarId: randomAvatarId,
      };

      setNotifications(prev => [...prev, newNotification]);

      // Remove notification after 3 seconds
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
      }, 3000);
    }
  }, [isPulsing]);

  return (
    <BorderHighlightCard className={`order-1 md:order-none feature-expandable md:col-span-7 md:row-span-1 md:col-start-6 group overflow-hidden bg-gradient-to-br from-teal-50 via-white to-sky-50 rounded-lg border border-slate-200 shadow-sm transition-all duration-500 ${isGlobeHovered ? 'md:-translate-y-20' : ''} ${isMobileActive ? 'mobile-active' : ''}`} onClick={onMobileClick}>
      <div className="p-6 relative">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-semibold max-w-xs text-slate-900">{t.features.incentivesRewards}</h3>
          <svg className="w-5 h-5 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>

        {/* Circular Carousel */}
        <div
          className="relative h-40 md:h-64 cursor-pointer loyalty-carousel"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full"
            style={{
              perspective: '2000px',
              perspectiveOrigin: 'center center',
            }}
          >
            <div
              className="relative w-full h-full"
              style={{
                transformStyle: 'preserve-3d',
              }}
            >
              {giftCards.map((card, cardIndex) => {
                // Find which slot this card is currently in
                const slotIndex = cardSlots.indexOf(cardIndex);
                const slot = slots[slotIndex];
                const radius = 280;

                // Slot 0 is the front position - pulse when isPulsing is true
                const shouldPulse = slot.isFront && isPulsing;
                const cardScale = shouldPulse ? 1.15 : 0.9;

                // In collapsed view, show slots 0, 1, and 5 (front and immediate neighbors)
                const isVisibleSlot = slotIndex === 0 || slotIndex === 1 || slotIndex === 5;
                const cardOpacity = isActive ? (slot.isFront ? 1 : 0.55) : (isVisibleSlot ? 1 : 0.55);

                return (
                  <div
                    key={`card-${cardIndex}`}
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-52 rounded-2xl bg-gradient-to-br ${card.gradient} shadow-2xl flex items-center justify-center`}
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: `
                        rotateY(${slot.angle}deg)
                        translateZ(${radius}px)
                        translateY(${isActive ? 0 : 30}px)
                        scale(${cardScale})
                      `,
                      opacity: cardOpacity,
                      zIndex: slot.isFront ? 10 : 1,
                      transition: shouldPulse
                        ? 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' // Fast bouncy expansion
                        : 'transform 1.5s ease-in-out', // Smooth slide between slots
                    }}
                  >
                    {card.logo && !imageErrors.has(cardIndex) ? (
                      <img
                        src={card.logo}
                        alt={card.name}
                        loading="lazy"
                        className="w-40 h-auto object-contain"
                        style={card.name === 'GARMIN' ? { transform: 'translateY(-15px)' } : {}}
                        onError={() => {
                          setImageErrors(prev => new Set(prev).add(cardIndex));
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl">
                        <div className="text-gray-400 text-2xl font-bold">{card.name}</div>
                      </div>
                    )}
                    <div className={`absolute bottom-4 right-5 text-xl font-bold ${card.name === 'NIKE' ? 'text-black' : 'text-white'}`}>{card.value}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* User notification bubbles */}
          {notifications.map((notification, index) => (
            <div
              key={notification.id}
              className="absolute right-4 bg-white rounded-full px-3 py-1.5 shadow-md border border-slate-100 flex items-center gap-2 z-20 pointer-events-none animate-fade-in-up"
              style={{
                top: `${8 + index * 40}px`,
                animationDelay: '0ms',
              }}
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-teal-400 to-sky-400 flex items-center justify-center text-white text-[8px] font-bold">
                {notification.name.charAt(0)}
              </div>
              <span className="text-[10px] font-medium text-slate-700">{notification.name} redeemed!</span>
            </div>
          ))}
        </div>

      </div>
    </BorderHighlightCard>
  );
}

export default function Features() {
  const [isGlobeHovered, setIsGlobeHovered] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const { t, direction } = useLanguage();
  const { track } = useAnalytics();
  const sectionRef = useRef<HTMLElement>(null);

  // Fire Pricing_Section_Viewed once when section scrolls into view
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          track(MARKETING.PRICING_SECTION_VIEWED, 'MARKETING', {
            page_path: window.location.pathname,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCard = (cardId: string) => {
    setExpandedCard(prev => prev === cardId ? null : cardId);
  };

  return (
    <section id="pricing" ref={sectionRef} className="pt-32 pb-16 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4 text-slate-900">
            {t.features.title}
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl">
            {t.features.subtitle}
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:auto-rows-[340px] md:mb-[-340px]">

          {/* Card 1: Accept payments - Tall card with animation */}
          <BorderHighlightCard className={`order-2 md:order-none shrinkable-card payment-card-expandable md:col-span-5 md:row-span-2 group overflow-hidden bg-white rounded-lg border border-slate-200 shadow-sm transition-all duration-500 ${expandedCard === 'payments' ? 'mobile-active' : ''}`} onClick={() => toggleCard('payments')}>
            <div className="relative h-full overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-100/50 to-orange-400/20 rounded-lg"></div>
              <div className="relative p-8 pb-2">
                <div className="flex justify-between items-start">
                  <h3 className="text-xl font-semibold max-w-xs text-slate-900">{t.features.acceptPayments}</h3>
                  <CreditCard className="text-orange-500 w-5 h-5" />
                </div>
              </div>
              <PaymentAnimation />
            </div>
          </BorderHighlightCard>

          {/* Expandable Incentives & Rewards Card with Circular Carousel */}
          <CircularCarouselCard isGlobeHovered={isGlobeHovered} isMobileActive={expandedCard === 'carousel'} onMobileClick={() => toggleCard('carousel')} />

          {/* Card 5: Borderless money */}
          <BorderHighlightCard
            className={`order-5 md:order-none peer/borderless borderless-shrinkable borderless-expandable md:col-span-7 md:col-start-6 group bg-gradient-to-br from-teal-50 via-sky-50/80 to-emerald-50 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all duration-500 ease-out relative overflow-hidden ${expandedCard === 'borderless' ? 'mobile-active' : ''}`}
            onMouseEnter={() => setIsGlobeHovered(true)}
            onMouseLeave={() => setIsGlobeHovered(false)}
            onClick={() => toggleCard('borderless')}
          >
            <div className="absolute inset-0 overflow-hidden rounded-lg">
              {/* Globe on right side, extended left for seamless blend - fixed width to prevent shrinking */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[450px] w-[900px]">
                <BorderlessGlobe isHovered={isGlobeHovered || expandedCard === 'borderless'} />
              </div>
            </div>
            <div className="absolute top-8 left-8 z-10">
              <h3 className="text-xl font-semibold text-slate-900 max-w-[200px]">{t.features.borderlessMoney}</h3>
            </div>
            <div className="absolute bottom-8 left-8 z-10">
              <Globe2 className="text-cyan-600 w-5 h-5 flex-shrink-0" />
            </div>
          </BorderHighlightCard>

          {/* Card 4: Card issuing */}
          <BorderHighlightCard className={`order-3 md:order-none md:col-span-5 group overflow-hidden bg-gradient-to-br from-sky-50 via-white to-teal-50 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all duration-500 ease-out flex flex-col ${expandedCard === 'issuing' ? 'mobile-active' : ''}`} onClick={() => toggleCard('issuing')}>
            <div className="p-8">
              <div className="flex justify-between items-start">
                <h3 className="text-xl font-semibold text-slate-900">{t.features.cardIssuing}</h3>
                <CardIcon className="text-cyan-500 w-5 h-5" />
              </div>
            </div>
            <div className="flex-grow flex items-center justify-center relative pb-12">
              <div
                className="w-64 h-40 rounded-lg bg-gradient-to-br from-teal-500 via-sky-400 to-orange-400 relative shadow-2xl overflow-hidden group/card"
                style={{
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.1s ease-out',
                }}
                onMouseMove={(e) => {
                  const card = e.currentTarget;
                  const rect = card.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const centerX = rect.width / 2;
                  const centerY = rect.height / 2;

                  // Inverse rotation
                  const rotateX = -(y - centerY) / 10;
                  const rotateY = (x - centerX) / 10;

                  card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
                  e.currentTarget.style.transition = 'transform 0.5s ease-out';
                }}
              >
                <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px] opacity-50"></div>
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover/card:translate-x-[100%] transition-transform duration-1000 ease-in-out"></div>
                <div className="p-6 relative flex flex-col h-full justify-between">
                  <div className="flex justify-between items-start">
                    <div className="w-10 h-7 border-2 border-white/40 rounded"></div>
                    <div className="w-10 h-7 bg-white/20 rounded border border-white/30 backdrop-blur-md"></div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <div className="h-2 w-24 bg-white/40 rounded"></div>
                      <div className="h-2 w-16 bg-white/40 rounded"></div>
                    </div>
                    <div className="text-white font-bold italic text-xl">VISA</div>
                  </div>
                </div>
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"></div>
            </div>
          </BorderHighlightCard>

          {/* Wallet Editor Card */}
          <BorderHighlightCard className={`order-4 md:order-none peer md:col-span-7 md:row-span-2 md:col-start-6 md:h-[340px] md:hover:h-[560px] wallet-card-hover group bg-gradient-to-tr from-emerald-100/50 to-emerald-400/20 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all duration-600 ease-out overflow-hidden peer-hover/borderless:translate-y-20 ${expandedCard === 'wallet' ? 'mobile-active' : ''}`} onClick={() => toggleCard('wallet')}>
            <div className="pt-8 px-8 pb-2 h-full relative">
              {/* Icon - fixed top right */}
              <svg className="absolute top-8 right-8 w-5 h-5 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>

              {/* Title - animated position */}
              <div className="wallet-title-animated absolute transition-all duration-600 ease-out">
                <h3 className="font-semibold leading-tight wallet-title-text bg-gradient-to-r from-teal-600 via-sky-500 to-orange-500 bg-clip-text text-transparent pr-1">
                  <span className="wallet-title-3lines text-4xl">{t.features.buildCustom}<br />{t.features.custom}<br />{t.features.experiences}</span>
                  <span className="wallet-title-2lines hidden text-xl">{t.features.customExperiences}</span>
                </h3>
              </div>

              {/* Wallet Editor */}
              <div className="wallet-editor-container">
                <WalletEditorCard />
              </div>
            </div>
          </BorderHighlightCard>

          {/* Card 6: Embed payments - Full width */}
          <BorderHighlightCard className={`order-6 md:order-none md:col-span-12 md:-mt-[340px] md:peer-hover:-mt-[120px] md:h-[340px] md:hover:h-[680px] group overflow-hidden bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all duration-500 ease-out flex flex-col md:flex-row items-stretch ${expandedCard === 'embed' ? 'mobile-active' : ''}`} onClick={() => toggleCard('embed')}>
            <div className="p-8 md:w-1/3 flex flex-col justify-center">
              <h3 className="text-2xl font-bold mb-4 text-slate-900">{t.features.embedPayments}</h3>
              <p className="text-slate-600 mb-6">
                {t.features.embedPaymentsDesc}
              </p>
              <a href="#" className="text-teal-600 font-medium flex items-center gap-1 hover:gap-2 transition-all">
                {t.features.learnMore} <ArrowRight className={`w-4 h-4 ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
              </a>
            </div>

            {/* Mobile: dashboard mockup (collapsed) + animation overlay (expanded) */}
            <div className="md:hidden relative bg-slate-50 border-t border-slate-200" style={{ height: '200px', overflow: 'hidden' }}>
              {/* Background gradient */}
              <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none overflow-hidden">
                <div className="absolute -top-1/4 -right-1/4 w-[150%] h-[150%] bg-gradient-to-br from-teal-500 via-sky-500 to-emerald-500 rotate-12"></div>
              </div>

              {/* Dashboard mockup illustration - always visible, fades when animation active */}
              <div className={`relative p-4 transition-opacity duration-500 ${expandedCard === 'embed' ? 'opacity-30' : 'opacity-100'}`}>
                <div className="relative bg-white/70 backdrop-blur-md border border-white/50 rounded-2xl shadow-xl p-4 h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-teal-500/20 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-sm bg-teal-500"></div>
                      </div>
                      <span className="font-semibold text-xs text-slate-900">FintechOS</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="h-4 w-12 bg-slate-200 rounded"></div>
                      <div className="h-4 w-4 bg-slate-200 rounded-full"></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="h-2 w-20 bg-slate-300 rounded"></div>
                      <div className="h-7 w-full bg-white border border-slate-200 rounded-lg shadow-sm flex items-center px-2 gap-1">
                        <Layers className="text-slate-400 w-3 h-3" />
                        <div className="h-2 w-16 bg-slate-200 rounded"></div>
                      </div>
                      <div className="h-7 w-full bg-white border border-slate-200 rounded-lg shadow-sm flex items-center px-2 gap-1">
                        <Layers className="text-slate-400 w-3 h-3" />
                        <div className="h-2 w-20 bg-slate-200 rounded"></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2 w-16 bg-slate-300 rounded"></div>
                      <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500"></div>
                        </div>
                        <div>
                          <div className="h-2 w-14 bg-slate-200 rounded mb-1"></div>
                          <div className="h-1.5 w-10 bg-slate-100 rounded"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SpendingLimits Animation - overlays on top when expanded */}
              <div
                className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${expandedCard === 'embed' ? 'opacity-100' : 'opacity-0'}`}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ transform: 'scale(0.48)', transformOrigin: 'top center', width: '208%', marginLeft: '-54%', height: '700px', position: 'relative', pointerEvents: 'none' }}>
                  <SpendingLimitsAnimation />
                </div>
              </div>
            </div>

            {/* Desktop: full interactive dashboard */}
            <div className="hidden md:block md:w-2/3 relative bg-slate-50 p-6 md:p-12 overflow-hidden border-t md:border-t-0 md:border-l border-slate-200">
              <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none overflow-hidden">
                <div className="absolute -top-1/4 -right-1/4 w-[150%] h-[150%] bg-gradient-to-br from-teal-500 via-sky-500 to-emerald-500 rotate-12"></div>
              </div>

              {/* Dashboard mockup - expands on hover */}
              <div className="relative bg-white/70 backdrop-blur-md border border-white/50 rounded-2xl shadow-xl p-6 h-full transition-all duration-500 scale-95 group-hover:scale-100">
                <div className="flex items-center justify-between mb-8 transition-opacity duration-300 group-hover:opacity-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-teal-500/20 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-sm bg-teal-500"></div>
                    </div>
                    <span className="font-semibold text-sm text-slate-900">FintechOS</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-6 w-16 bg-slate-200 rounded"></div>
                    <div className="h-6 w-6 bg-slate-200 rounded-full"></div>
                  </div>
                </div>

                {/* Placeholder boxes - fade out on hover */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 transition-opacity duration-300 group-hover:opacity-0">
                  <div className="space-y-4">
                    <div className="h-3 w-32 bg-slate-300 rounded"></div>
                    <div className="h-10 w-full bg-white border border-slate-200 rounded-lg shadow-sm flex items-center px-3 gap-2">
                      <Layers className="text-slate-400 w-4 h-4" />
                      <div className="h-3 w-24 bg-slate-200 rounded"></div>
                    </div>
                    <div className="h-10 w-full bg-white border border-slate-200 rounded-lg shadow-sm flex items-center px-3 gap-2">
                      <Layers className="text-slate-400 w-4 h-4" />
                      <div className="h-3 w-32 bg-slate-200 rounded"></div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-3 w-24 bg-slate-300 rounded"></div>
                    <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-slate-100 shadow-sm">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full border-2 border-emerald-500"></div>
                      </div>
                      <div>
                        <div className="h-3 w-20 bg-slate-200 rounded mb-1"></div>
                        <div className="h-2 w-16 bg-slate-100 rounded"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Spending Limits Animation - emerge from placeholder positions */}
                <div className="absolute inset-0 p-6 opacity-0 pointer-events-none transition-all duration-500 group-hover:opacity-100 group-hover:pointer-events-auto">
                  <SpendingLimitsAnimation />
                </div>
              </div>
            </div>
          </BorderHighlightCard>

        </div>
      </div>
    </section>
  );
}
