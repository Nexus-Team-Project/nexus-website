/**
 * TransactionSuccessShell - ported from nexus-wallet
 * (src/components/ui/TransactionSuccessShell.tsx). This is the wallet's
 * payment-demonstration / "המחשת תשלום" screen: a spinner that resolves into a
 * green check, a cashback count-up, an optional merchant logo inside the circle,
 * and a receipt card. In the SPAR gift flow the wallet opens it when the user
 * taps "Simulate payment" on the flipped gift card.
 *
 * Adaptations for the website hero: no router/wallet-i18n (strings come via the
 * `isHe` prop, exactly like the original). Added a `compact` prop that scales
 * the circle + margins + text down to sit inside the ~310px phone frame, a
 * `reduce` prop (prefers-reduced-motion: jump straight to the revealed receipt),
 * and a `spinMs` prop so the hero can shorten the spin for a tight auto-play
 * dwell. Full-screen defaults reproduce the wallet 1:1.
 */
import { useEffect, useState, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

const R = 52;
const CX = 66;
const CY = 66;
const CIRC = 2 * Math.PI * R;
const GREEN_BG = '#DCFCE7';
const GREEN_STROKE = '#16A34A';
const RED_BG = '#FEE2E2';
const RED_STROKE = '#DC2626';

type Phase = 'spinning' | 'completing' | 'check' | 'reveal';

export interface TransactionSuccessShellProps {
  cashback?: number;
  isHe: boolean;
  onClose: () => void;
  /** ms after reveal before auto-navigating. 0 = disabled. Default 5500. */
  autoMs?: number;
  tone?: 'success' | 'declined';
  iconUrl?: string;
  previewSlot?: ReactNode;
  children: ReactNode;
  /** Phone-frame sizing (smaller circle, tighter margins + text). */
  compact?: boolean;
  /** prefers-reduced-motion: skip the spin and reveal immediately. */
  reduce?: boolean | null;
  /** Spin duration before the check draws (default 1800). */
  spinMs?: number;
}

export default function TransactionSuccessShell({
  cashback = 0,
  isHe,
  onClose,
  autoMs = 5500,
  tone = 'success',
  iconUrl,
  previewSlot,
  children,
  compact = false,
  reduce = false,
  spinMs = 1800,
}: TransactionSuccessShellProps) {
  const declined = tone === 'declined';
  const circleBg = declined ? RED_BG : GREEN_BG;
  const accent = declined ? RED_STROKE : GREEN_STROKE;
  const glyphPath = declined ? 'M 42 42 L 78 78 M 78 42 L 42 78' : 'M 28 62 L 50 82 L 92 36';
  const [phase, setPhase] = useState<Phase>(reduce ? 'reveal' : 'spinning');
  const [cashbackCount, setCashbackCount] = useState(reduce ? cashback : 0);
  const spinCtrl = useAnimation();
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Phone-frame vs full-screen metrics.
  const circleSize = compact ? 84 : 120;
  const spinnerSize = Math.round(circleSize * 1.1);
  const spinnerOffset = -Math.round((spinnerSize - circleSize) / 2);
  const strokeW = compact ? 4 : 5;
  const iconSize = compact ? 30 : 40;

  // Kick off the rotation (skipped entirely under reduced-motion).
  useEffect(() => {
    if (reduce) return;
    spinCtrl.start({ rotate: 360 * 100, transition: { duration: 110, ease: 'linear' } });
    const t = setTimeout(() => setPhase('completing'), spinMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'completing') {
      spinCtrl.stop();
      const t = setTimeout(() => setPhase('check'), 300);
      return () => clearTimeout(t);
    }
    if (phase === 'check') {
      const t = setTimeout(() => setPhase('reveal'), 1100);
      return () => clearTimeout(t);
    }
    if (phase === 'reveal') {
      if (cashback > 0 && !reduce) {
        const steps = Math.min(Math.max(Math.round(cashback * 10), 20), 60);
        const interval = 1200 / steps;
        let step = 0;
        const id = setInterval(() => {
          step++;
          const eased = 1 - Math.pow(1 - step / steps, 3);
          setCashbackCount(Math.round(eased * cashback * 100) / 100);
          if (step >= steps) clearInterval(id);
        }, interval);
      }
      if (autoMs > 0) {
        const t = setTimeout(() => onCloseRef.current(), autoMs);
        return () => clearTimeout(t);
      }
    }
  }, [phase, cashback, autoMs, reduce]);

  const arcDashOffset = phase === 'spinning' ? CIRC * 0.3 : 0;
  const arcOpacity = phase === 'check' || phase === 'reveal' ? 0 : 1;

  return (
    <div
      className={`${compact ? 'h-full' : 'min-h-dvh'} bg-white flex flex-col items-center max-w-md mx-auto overflow-hidden ${compact ? 'px-4' : 'px-5'}`}
      dir={isHe ? 'rtl' : 'ltr'}
    >
      {/* Animated circle */}
      <motion.div
        className="relative flex items-center justify-center"
        style={{
          marginTop: phase === 'reveal' ? (compact ? 8 : 12) : compact ? 84 : 220,
          marginBottom: phase === 'reveal' ? (compact ? -46 : -74) : 0,
          transition: 'margin-top 0.55s cubic-bezier(0.4, 0, 0.2, 1), margin-bottom 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        animate={phase === 'reveal' ? { y: compact ? -30 : -44, scale: 0.5 } : { y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.55, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="rounded-full" style={{ width: circleSize, height: circleSize, background: circleBg }} />

        <motion.svg
          className="absolute"
          style={{ top: spinnerOffset, left: spinnerOffset, width: spinnerSize, height: spinnerSize }}
          viewBox="0 0 132 132"
          animate={spinCtrl}
        >
          <motion.circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={accent}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            animate={{ strokeDashoffset: arcDashOffset, opacity: arcOpacity }}
            transition={{
              strokeDashoffset: { duration: phase === 'completing' ? 0.28 : 0, ease: 'easeOut' },
              opacity: { duration: 0.2 },
            }}
          />
        </motion.svg>

        <svg className="absolute inset-0" width={circleSize} height={circleSize} viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
          <motion.path
            d={glyphPath}
            fill="none"
            stroke={accent}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
            animate={{
              pathLength: phase === 'check' || phase === 'reveal' ? 1 : 0,
              opacity: phase === 'check' || phase === 'reveal' ? 1 : 0,
            }}
            transition={{
              pathLength: { duration: reduce ? 0 : 0.58, ease: [0.16, 1, 0.3, 1], delay: 0.05 },
              opacity: { duration: 0.05 },
            }}
          />
        </svg>

        {iconUrl && (
          <AnimatePresence>
            {(phase === 'check' || phase === 'reveal') && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: reduce ? 0 : 0.5, duration: 0.3 }}
              >
                <img src={iconUrl} alt="" draggable={false} style={{ width: iconSize, height: iconSize }} className="object-contain rounded-lg" />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>

      {/* Cashback counter */}
      <AnimatePresence>
        {phase === 'reveal' && cashback > 0 && (
          <motion.div
            className={`flex flex-col items-center gap-1 ${compact ? 'mt-2' : 'mt-3'}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.35 }}
          >
            <span className={`${compact ? 'text-[26px]' : 'text-[34px]'} font-bold leading-none tabular-nums`} style={{ color: accent }} dir="ltr">
              +₪{Number.isInteger(cashbackCount) ? cashbackCount : cashbackCount.toFixed(2)}
            </span>
            <span className={`${compact ? 'text-[11px]' : 'text-[13px]'} font-medium text-green-700`}>
              {isHe ? 'קאשבק נצבר' : 'cashback earned'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview slot */}
      <AnimatePresence>
        {phase === 'reveal' && previewSlot && (
          <motion.div
            className={`w-full ${compact ? 'mt-3' : 'mt-4'}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.15 }}
          >
            {previewSlot}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Receipt card */}
      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div
            className={`w-full ${compact ? 'mt-4' : 'mt-5'} bg-white border border-border rounded-2xl overflow-hidden ${compact ? 'mb-4' : 'mb-8'}`}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.2 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
