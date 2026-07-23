/**
 * BalanceCard - ported from nexus-wallet (src/components/wallet/BalanceCard.tsx).
 * The navy "Nexus balance" (יתרת נקסוס) card with an animated count-up. Adapted
 * for the website hero: the `useCardImageStore` (user-chosen art) dependency is
 * dropped so the card always uses the default `/cards/nexus-balance-card.png`
 * artwork, and the `t.wallet.newBadge` string is inlined (he/en via useLanguage).
 * The count-up (raf, 1100ms, countFrom -> balance) is preserved 1:1 - it powers
 * the "cashback accruing to the Nexus balance" step in HeroGiftFlow.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatCurrency';

interface BalanceCardProps {
  balance: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Detail/deck variant: Nexus wordmark in the corner + card artwork. */
  logoCorner?: boolean;
  /** When set, animate from this value up to balance (post-transaction reveal). */
  countFrom?: number;
  /** Called once the count-up animation completes. */
  onCountComplete?: () => void;
}

export default function BalanceCard({
  balance,
  className = '',
  style,
  children,
  logoCorner = false,
  countFrom,
  onCountComplete,
}: BalanceCardProps) {
  const { language } = useLanguage();
  const locale = language === 'he' ? 'he-IL' : 'en-IL';
  const newBadge = language === 'he' ? 'חדש' : 'New';

  const target = balance || 0;
  const from = countFrom ?? 0;
  const [display, setDisplay] = useState(from);
  const onCompleteRef = useRef(onCountComplete);
  useEffect(() => { onCompleteRef.current = onCountComplete; });

  useEffect(() => {
    if (target <= 0) { setDisplay(0); return; }
    let raf = 0;
    let startTs = 0;
    const duration = 1100;
    const tick = (now: number) => {
      if (!startTs) startTs = now;
      const p = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        onCompleteRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <div
      className={
        logoCorner
          ? `relative isolate p-6 text-right flex flex-col justify-end items-start ${className}`
          : `relative rounded-[22px] p-8 text-center overflow-hidden shadow-lg shadow-[#0a2540]/30 ${className}`
      }
      style={
        logoCorner
          ? { ...style }
          : {
              background:
                'radial-gradient(120% 120% at 30% 20%, rgba(125,211,252,0.18), transparent 55%), linear-gradient(135deg, #0a2540 0%, #0a2540 55%, #06182b 100%)',
              border: '1px solid rgba(125,211,252,0.25)',
              ...style,
            }
      }
    >
      {/* Deck front: the default Nexus card artwork floating behind the labels. */}
      {logoCorner && (
        <img
          src="/cards/nexus-balance-card.png"
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 -z-10 w-full h-full object-contain pointer-events-none"
          style={{ filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.3))' }}
        />
      )}

      {!logoCorner && (
        <span className="absolute top-4 start-4 bg-[#7dd3fc]/20 text-[#7dd3fc] text-xs font-bold px-2.5 py-0.5 rounded-full">
          {newBadge}
        </span>
      )}

      {/* Label */}
      {logoCorner ? (
        <span className="text-white/70 font-medium text-sm relative">
          {language === 'he' ? 'היתרה שלי' : 'My balance'}
        </span>
      ) : (
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 text-white/80 font-medium">
            <span>יתרת</span>
            <span className="inline-flex items-center bg-sky-300 rounded-xl px-3 py-1 overflow-hidden" style={{ transform: 'scale(0.873)' }}>
              <img src="/nexus-logo-black.png" alt="Nexus" className="h-7 w-auto object-contain" style={{ transform: 'scale(1.373)' }} />
            </span>
          </span>
        </div>
      )}

      {/* Balance amount - the shekel sign a touch smaller than the digits. */}
      <h1 className={`font-bold text-white tracking-tight relative ${logoCorner ? 'text-5xl' : 'text-6xl mb-1'}`}>
        {formatCurrency(display, 'ILS', locale)
          .split(/(₪)/)
          .map((part, i) =>
            part === '₪' ? (
              <span key={i} className="text-[0.6em] font-semibold">
                ₪
              </span>
            ) : (
              <span key={i} className="tabular-nums">
                {part}
              </span>
            ),
          )}
      </h1>

      {children}

      {/* Deck front: "New" + cashback pills, bottom-start. */}
      {logoCorner && (
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5">
          <span className="bg-[#7dd3fc]/20 text-[#7dd3fc] text-xs font-bold px-2.5 py-0.5 rounded-full">{newBadge}</span>
          <span className="bg-emerald-400/20 text-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {language === 'he' ? 'עד 60% CashBack' : 'Up to 60% CashBack'}
          </span>
        </div>
      )}
    </div>
  );
}
