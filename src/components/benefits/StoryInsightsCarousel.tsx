/**
 * StoryInsightsCarousel — adapted from nexus-wallet InsightsPage.tsx (SmartInsightsCarousel)
 * Section 2: "עד 60% קאשבק"
 * Animated expense carousel with rotating shapes, slider, and running cashback counter.
 */
import {
  AnimatePresence,
  animate,
  motion,
  useAnimation,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

// ── Shape dimensions ──
const D = 320;
const R = D / 2;
const RECT_H = 90;

// ── Card dimensions ──
const CARD_W = 240;
const TX_CARD_HEIGHT = 82;

interface Slide {
  title: string;
  titleEn: string;
  leftValue: number;
  rightValue: number;
  shapeColor: string;
}

const slides: Slide[] = [
  { title: 'הוצאות אוכל בחוץ', titleEn: 'Dining expenses', leftValue: 2434, rightValue: 2102, shapeColor: '#d4d0f6' },
  { title: 'הוצאות ביגוד והנעלה', titleEn: 'Clothing expenses', leftValue: 480, rightValue: 58, shapeColor: '#c7f5d4' },
  { title: 'הוצאות פיננסיות וביטוחים', titleEn: 'Financial expenses', leftValue: 3200, rightValue: 2750, shapeColor: '#ddd8fc' },
  { title: 'הוצאות בסופר', titleEn: 'Grocery expenses', leftValue: 1800, rightValue: 1520, shapeColor: '#fde68a' },
];

type Pose = { x: number; y: number; rotate: number };
type Tx = { date: string; dateEn: string; merchant: string; original: number; paid: number; cashback: number };

const clothingTxs: Tx[] = [
  { date: '15 בינואר 2024', dateEn: 'Jan 15, 2024', merchant: 'Golf', original: 180, paid: 150, cashback: 30 },
  { date: '03 בפברואר 2024', dateEn: 'Feb 03, 2024', merchant: 'FOX', original: 220, paid: 200, cashback: 20 },
  { date: '18 במרץ 2024', dateEn: 'Mar 18, 2024', merchant: 'Laline', original: 260, paid: 210, cashback: 50 },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function NexusSemicircleBaseShape({ color }: { color: string }) {
  return (
    <div className="relative" style={{ width: D, height: R + RECT_H }}>
      <div style={{ width: D, height: RECT_H, backgroundColor: color }} />
      <div
        style={{
          width: D, height: R, backgroundColor: color,
          borderBottomLeftRadius: R, borderBottomRightRadius: R,
        }}
      />
    </div>
  );
}

function RotatingBlob({ color = '#635bff' }: { color?: string }) {
  return (
    <motion.svg
      width={78} height={78} viewBox="0 0 100 100"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
      style={{ display: 'block', opacity: 0.3 }}
    >
      <path
        d="M50 6 C61 6, 70 13, 76 22 C86 27, 95 37, 92 50 C95 62, 86 72, 76 78 C70 87, 61 94, 50 92 C39 94, 30 87, 24 78 C14 72, 5 62, 8 50 C5 37, 14 27, 24 22 C30 13, 39 6, 50 6 Z"
        fill={color}
      />
    </motion.svg>
  );
}

const cardOffsets = [
  { x: 20, y: 220 },
  { x: -30, y: 300 },
  { x: 40, y: 160 },
  { x: -40, y: 160 },
];

const slideOverlays = [
  { src: '/coffee.png',     style: { top: 120, left: 8 } as const,  endRotate: 6 },
  { src: '/shoe.png',       style: { top: 120, right: 8 } as const, endRotate: -8 },
  { src: '/calculator.png', style: { top: 120, left: 8 } as const,  endRotate: 5 },
  { src: '/avocado.png',    style: { top: 120, right: 8 } as const, endRotate: 12 },
];

// Preload overlay images
if (typeof window !== 'undefined') {
  slideOverlays.forEach(({ src }) => { const i = new Image(); i.src = src; });
}

export default function StoryInsightsCarousel() {
  const { language } = useLanguage();
  const he = language === 'he';

  const [index, setIndex] = useState(0);
  const [visibleTxCount, setVisibleTxCount] = useState(0);
  const shapeControls = useAnimation();
  const slidesLen = slides.length;

  const balance = useMotionValue(0);
  const formattedBalance = useTransform(balance, (v) => `₪${Math.round(v).toLocaleString()}`);
  const balanceTarget = useRef(0);

  const safeIndex = useMemo(() => {
    if (slidesLen === 0) return 0;
    return ((index % slidesLen) + slidesLen) % slidesLen;
  }, [index, slidesLen]);

  const slide = slides[safeIndex];

  // Sequential popups only on clothing slide
  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    if (safeIndex === 1) {
      setVisibleTxCount(0);
      timers.push(setTimeout(() => setVisibleTxCount(1), 900));
      timers.push(setTimeout(() => setVisibleTxCount(2), 1800));
      timers.push(setTimeout(() => setVisibleTxCount(3), 2700));
    } else {
      setVisibleTxCount(0);
    }
    return () => timers.forEach(clearTimeout);
  }, [safeIndex]);

  // Accumulate balance
  useEffect(() => {
    const diff = slide.leftValue - slide.rightValue;
    balanceTarget.current += diff;
    const ctrl = animate(balance, balanceTarget.current, { duration: 1.2, ease: 'easeOut' });
    return () => ctrl.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex]);

  // Counter + slider
  const amount = useMotionValue(slide.leftValue);
  const formattedAmount = useTransform(amount, (v) => `₪${Math.round(v).toLocaleString()}`);
  const formattedInitial = `₪${slide.leftValue.toLocaleString()}`;

  const percent = useMotionValue(0);
  const percentRemaining = useMemo(() => {
    const d = slide.leftValue;
    if (!Number.isFinite(d) || d <= 0) return 100;
    return clamp(100 - (slide.rightValue / d) * 100, 0, 100);
  }, [slide.leftValue, slide.rightValue]);

  const adjustedPercent = useMemo(() => clamp(percentRemaining, 0, 45), [percentRemaining]);
  const fillWidthCss = useTransform(percent, (p) => `${100 - p}%`);

  useEffect(() => {
    percent.set(0);
    amount.set(slide.leftValue);
    const a1 = animate(percent, adjustedPercent, { duration: 1.4, ease: 'easeInOut' });
    const a2 = animate(amount, slide.rightValue, { duration: 1.4, ease: 'easeInOut' });
    return () => { a1.stop(); a2.stop(); };
  }, [amount, percent, adjustedPercent, slide.leftValue, slide.rightValue]);

  // Shape & card movement
  const poses: Pose[] = useMemo(() => [
    { x: 0, y: 0, rotate: 0 },
    { x: -190, y: 140, rotate: 135 },
    { x: 150, y: -50, rotate: 45 },
    { x: -150, y: -50, rotate: -45 },
  ], []);

  const initialOffscreen = useRef<Pose>({ x: 260, y: 260, rotate: 20 });
  const phaseRef = useRef(0);

  useEffect(() => {
    if (slidesLen === 0) return;
    let cancelled = false;
    const run = async () => {
      try {
        shapeControls.set(initialOffscreen.current);
        await shapeControls.start({ ...poses[0], transition: { duration: 1 } });
        phaseRef.current = 0;

        while (!cancelled) {
          const waitTime = phaseRef.current === 1 ? 5000 : 2800;
          await sleep(waitTime);
          const nextPhase = (phaseRef.current + 1) % poses.length;
          setIndex((prev) => (prev + 1) % slidesLen);
          await shapeControls.start({ ...poses[nextPhase], transition: { duration: 1 } });
          phaseRef.current = nextPhase;
        }
      } catch { /* unmounted */ }
    };
    run();
    return () => { cancelled = true; };
  }, [poses, shapeControls, slidesLen]);

  const blobPos = useMemo(() => {
    if (safeIndex === 0) return { top: 84, left: 18 };
    if (safeIndex === 1) return { top: 360, left: 262 };
    if (safeIndex === 2) return { top: 100, left: 278 };
    return { top: 100, left: 36 };
  }, [safeIndex]);

  const cardLift = safeIndex === 1 ? visibleTxCount * TX_CARD_HEIGHT : 0;

  return (
    <div className="w-full max-w-sm relative mx-auto" style={{ minHeight: 520 }}>
      {/* Background shape */}
      <motion.div
        animate={shapeControls}
        initial={initialOffscreen.current}
        className="absolute left-1/2 -translate-x-1/2 z-0"
        style={{ top: 80 }}
      >
        <NexusSemicircleBaseShape color={slide.shapeColor} />
      </motion.div>

      {/* Image overlay */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`overlay-${safeIndex}`}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1, rotate: slideOverlays[safeIndex].endRotate, transition: { duration: 0.5, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className="absolute z-[5]"
          style={slideOverlays[safeIndex].style}
        >
          <img
            src={slideOverlays[safeIndex].src}
            alt=""
            style={{ width: 180, height: 'auto', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.2))' }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Blob */}
      <motion.div className="absolute z-0" style={blobPos}>
        <RotatingBlob />
      </motion.div>

      {/* Card wrapper */}
      <motion.div
        initial={{ x: cardOffsets[0].x + 260, y: cardOffsets[0].y + 260, opacity: 0 }}
        animate={{
          x: cardOffsets[safeIndex]?.x ?? 0,
          y: (cardOffsets[safeIndex]?.y ?? 220) - cardLift,
          opacity: 1,
        }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="absolute z-30 left-1/2"
        style={{ width: CARD_W, marginLeft: -(CARD_W / 2) }}
      >
        {/* Main expenses card */}
        <div className="bg-white rounded-2xl shadow-xl p-5" style={{ width: CARD_W }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={safeIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <h2 className="text-center font-semibold text-sm mb-4 text-slate-900">
                {he ? slide.title : slide.titleEn}
              </h2>

              {/* Slider */}
              <div className="w-full h-3 rounded-full overflow-hidden bg-slate-200">
                <motion.div
                  style={{ width: fillWidthCss, marginLeft: 'auto', backgroundColor: '#635bff' }}
                  className="h-full rounded-full"
                />
              </div>

              {/* Numbers */}
              <div className="flex justify-between items-center mt-2 px-1">
                <motion.div className="text-[11px] font-bold" style={{ color: '#635bff' }}>
                  {formattedAmount}
                </motion.div>
                <div className="text-[11px] font-semibold text-slate-400">
                  {formattedInitial}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Transaction cards (clothing slide) */}
        {safeIndex === 1 && clothingTxs.slice(0, visibleTxCount).map((tx, i) => (
          <motion.div
            key={tx.merchant}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: i * 0.05 }}
            className="bg-white rounded-xl shadow-lg p-3 mt-2 border border-slate-200"
          >
            <div className="text-[10px] mb-1 text-slate-400">
              {he ? tx.date : tx.dateEn}
            </div>
            <div className="flex justify-between items-center text-xs font-medium">
              <span className="text-slate-900">{tx.merchant}</span>
              <span className="text-green-500">+₪{tx.cashback}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px] mt-2 text-slate-400">
              <div>
                <div>{he ? 'סכום עסקה' : 'Amount'}</div>
                <div className="font-semibold text-slate-700">₪{tx.original}</div>
              </div>
              <div>
                <div>{he ? 'שולם בפועל' : 'Paid'}</div>
                <div className="font-semibold text-slate-700">₪{tx.paid}</div>
              </div>
              <div>
                <div>{he ? 'החזר' : 'Cashback'}</div>
                <div className="font-semibold text-green-500">₪{tx.cashback}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
