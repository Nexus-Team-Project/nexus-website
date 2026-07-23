/**
 * PremiumReveal - ported from nexus-wallet (src/pages/PremiumRevealPage.tsx),
 * exporting `PremiumRevealContent`. Adaptations for the website hero: the
 * react-router `useNavigate`/`useParams` are removed (there is nothing to
 * navigate to inside the hero), so `onReveal` is the single completion hook -
 * HeroGiftFlow uses it to loop back to the cover. Keyframes (blob1..5,
 * riseBubble) live in index.css. Behaviour is otherwise 1:1: animated gradient
 * + flash / ripple / particles + brand logos rising as bubbles.
 */
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

const BG_COLOR = '#f6f9fc';
const DARK_COLOR = '#000000';
const CAP_COLOR = '#635bff';
const CAP_SIZE = 76;
const CAP_TOP_PAD = 8;
const TRACK_GAP = 3;
const REVEAL_GAP = 4;
const PILL_MIN = CAP_TOP_PAD + CAP_SIZE / 2;
const RING_THICKNESS = 3;

const PARTICLE_COLORS = [
  '#d881f4', '#80deea', '#ffd54f', '#f48fb1',
  '#b39ddb', '#ff91b8', '#ffb74d', '#ffffff',
];

const BRANDS = [
  { name: 'Carrefour', logo: '/brands/carrefour.png', color: '#FFFFFF' },
  { name: 'Golf & Co', logo: '/brands/golf.png', color: '#FFFFFF' },
  { name: 'American Eagle', logo: '/brands/american-eagle.png', color: '#00205B' },
  { name: 'Rami Levy', logo: '/brands/rami-levy.png', color: '#B3171D' },
  { name: 'Mango', logo: '/brands/mango.png', color: '#FFFFFF' },
  { name: 'Foot Locker', logo: '/brands/foot-locker.png', color: '#D3D3D3' },
  { name: 'Samsung', logo: '/brands/samsung.png', color: '#1428A0' },
  { name: 'Castro Home', logo: '/brands/castro-home.png', color: '#F5F5DC' },
  { name: 'Billabong', logo: '/brands/billabong.png', color: '#00A5A5' },
  { name: 'Hoodies', logo: '/brands/hoodis.png', color: '#8BA83F' },
  { name: "Sack's", logo: '/brands/sacks.png', color: '#F5F5DC' },
  { name: 'Magnolia', logo: '/brands/magnolia.png', color: '#F5E6E8' },
  { name: 'Yves Rocher', logo: '/brands/yves-rocher.png', color: '#FFFFFF' },
  { name: 'Ruby Bay', logo: '/brands/ruby-bay.png', color: '#7AB3C4' },
];

interface Particle {
  id: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

interface Bubble {
  id: number;
  brand: typeof BRANDS[0];
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
}

/**
 * Premium Reveal content. In the hero it is always mounted with `autoReveal`,
 * so it fires the celebration on mount and calls `onReveal` after
 * `revealHoldMs`. The drag interaction is preserved for parity but unused.
 */
export function PremiumRevealContent({
  onReveal,
  autoReveal = false,
  revealHoldMs = 7000,
}: {
  onReveal?: () => void;
  autoReveal?: boolean;
  revealHoldMs?: number;
}) {
  const [pillHeight] = useState(PILL_MIN);
  const [revealed, setRevealed] = useState(autoReveal);
  const [showFlash, setShowFlash] = useState(false);
  const [ripples, setRipples] = useState<number[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [viewH, setViewH] = useState(800);

  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleIdRef = useRef(0);

  useEffect(() => {
    const updateH = () => {
      if (containerRef.current) {
        setViewH(containerRef.current.clientHeight);
      } else {
        setViewH(window.innerHeight);
      }
    };
    updateH();
    window.addEventListener('resize', updateH);
    return () => window.removeEventListener('resize', updateH);
  }, []);

  // Spawn rising bubbles after reveal.
  useEffect(() => {
    if (!revealed) return;

    const initial: Bubble[] = BRANDS.map((brand, i) => ({
      id: bubbleIdRef.current++,
      brand,
      left: Math.random() * 70 + 15,
      size: Math.random() * 30 + 65,
      duration: Math.random() * 3 + 5,
      delay: i * 0.25,
      drift: (Math.random() - 0.5) * 60,
    }));
    setBubbles(initial);

    const interval = setInterval(() => {
      setBubbles((prev) => {
        const brand = BRANDS[Math.floor(Math.random() * BRANDS.length)];
        return [...prev.slice(-30), {
          id: bubbleIdRef.current++,
          brand,
          left: Math.random() * 70 + 15,
          size: Math.random() * 30 + 65,
          duration: Math.random() * 3 + 5,
          delay: 0,
          drift: (Math.random() - 0.5) * 60,
        }];
      });
    }, 800);

    return () => clearInterval(interval);
  }, [revealed]);

  const PILL_MAX = viewH * 0.88;

  const revealW = CAP_SIZE + REVEAL_GAP * 2;
  const containerW = revealW + TRACK_GAP * 2;
  const containerBaseH = Math.round(viewH / 6);

  const capBottom = pillHeight - PILL_MIN - CAP_SIZE / 2;
  const revealH = Math.max(containerBaseH, capBottom + CAP_SIZE + CAP_TOP_PAD + REVEAL_GAP);
  const containerH = revealH + TRACK_GAP;
  const pillProgress = (pillHeight - PILL_MIN) / (PILL_MAX - PILL_MIN);

  const triggerReveal = useCallback(() => {
    setRevealed(true);

    setTimeout(() => {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 120);
    }, 100);

    setTimeout(() => setRipples([Date.now()]), 80);

    setTimeout(() => {
      setParticles(
        Array.from({ length: 25 }, (_, i) => ({
          id: i,
          vx: (Math.random() - 0.5) * 14,
          vy: -(Math.random() * 10 + 4),
          size: 3 + Math.random() * 5,
          color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        })),
      );
    }, 150);

    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);

    setTimeout(() => {
      if (onReveal) onReveal();
    }, revealHoldMs);
  }, [onReveal, revealHoldMs]);

  // Fire the reveal celebration automatically on mount (no drag) in the hero.
  const didAutoReveal = useRef(false);
  useEffect(() => {
    if (autoReveal && !didAutoReveal.current) {
      didAutoReveal.current = true;
      triggerReveal();
    }
  }, [autoReveal, triggerReveal]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      dir="rtl"
      style={{ touchAction: 'none', overscrollBehavior: 'none', background: BG_COLOR }}
    >
      {/* Layer 0 - Animated gradient background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#ffb74d] via-[#ff91b8] to-[#9c88ff]">
        <div className="absolute" style={{ width: '150%', height: '150%', top: '-25%', left: '-25%', filter: 'blur(70px)' }}>
          <div className="absolute rounded-full" style={{ width: '55%', height: '65%', top: '0%', left: '50%', opacity: 0.9, background: 'radial-gradient(circle, #d881f4, #c068e0)', animation: 'blob1 10s ease-in-out infinite alternate' }} />
          <div className="absolute rounded-full" style={{ width: '60%', height: '60%', top: '20%', left: '20%', opacity: 0.9, background: 'radial-gradient(circle, #80deea, #4dd0e1)', animation: 'blob2 13s ease-in-out infinite alternate' }} />
          <div className="absolute rounded-full" style={{ width: '45%', height: '45%', top: '12%', left: '-5%', opacity: 0.8, background: 'radial-gradient(circle, #ffd54f, #ffb74d)', animation: 'blob3 12s ease-in-out infinite alternate' }} />
          <div className="absolute rounded-full" style={{ width: '55%', height: '55%', top: '30%', left: '40%', opacity: 0.85, background: 'radial-gradient(circle, #f48fb1, #ec407a)', animation: 'blob4 11s ease-in-out infinite alternate' }} />
          <div className="absolute rounded-full" style={{ width: '50%', height: '55%', top: '5%', left: '30%', opacity: 0.85, background: 'radial-gradient(circle, #b39ddb, #9575cd)', animation: 'blob5 14s ease-in-out infinite alternate' }} />
        </div>
      </div>

      {/* Layer 1 - BG overlay fades out on reveal */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{ background: BG_COLOR, opacity: revealed ? 0 : 1, transition: 'opacity 0.4s' }}
      />

      {/* Rising brand bubbles */}
      {revealed && (
        <div className="absolute inset-0 z-[5] overflow-hidden pointer-events-none">
          {bubbles.map((b) => (
            <div
              key={b.id}
              className="absolute"
              style={{
                left: `${b.left}%`,
                bottom: '-120px',
                width: b.size,
                height: b.size,
                animationName: 'riseBubble',
                animationDuration: `${b.duration}s`,
                animationDelay: `${b.delay}s`,
                animationTimingFunction: 'linear',
                animationFillMode: 'forwards',
                ['--drift' as string]: `${b.drift}px`,
              }}
            >
              <div
                className="w-full h-full rounded-full flex items-center justify-center shadow-xl"
                style={{ backgroundColor: b.brand.color, boxShadow: `0 10px 40px ${b.brand.color}40` }}
              >
                <img
                  src={b.brand.logo}
                  alt={b.brand.name}
                  className="w-3/5 h-3/5 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Text - centered, hidden once revealed */}
      <div
        className="absolute inset-x-0 z-20 flex flex-col items-center justify-center pointer-events-none"
        style={{ top: '30%', opacity: revealed ? 0 : 1, transition: 'opacity 0.4s' }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-2xl font-semibold text-center mb-3"
          style={{ color: 'var(--color-primary)' }}
        >
          הכל מוכן.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-lg text-center"
          style={{ color: 'var(--color-primary)', opacity: 0.7 }}
        >
          הצעד הבא שלך מחכה
        </motion.p>
      </div>

      {/* Container + reveal tracks (dark), fade out on reveal */}
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-0 z-[15] pointer-events-none"
        style={{
          width: containerW,
          height: containerH,
          borderRadius: `${containerW / 2}px ${containerW / 2}px 0 0`,
          background: DARK_COLOR,
          overflow: 'hidden',
          opacity: revealed ? 0 : 1,
          transition: 'opacity 0.4s',
        }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-0 z-[16] pointer-events-none"
        style={{
          width: revealW,
          height: revealH,
          borderRadius: `${revealW / 2}px ${revealW / 2}px 0 0`,
          background: DARK_COLOR,
          overflow: 'hidden',
          opacity: revealed ? 0 : 1,
          transition: 'opacity 0.4s',
        }}
      >
        <div
          className="absolute left-0 right-0 bottom-0"
          style={{
            height: `${Math.min(100, pillProgress * 110)}%`,
            background: 'linear-gradient(180deg, rgba(216,129,244,0.8), rgba(128,222,234,0.6), rgba(255,213,79,0.7), rgba(244,143,177,0.8))',
          }}
        />
      </div>

      {/* Cap button - purple with gradient ring */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center justify-center"
        style={{
          bottom: capBottom - RING_THICKNESS,
          width: CAP_SIZE + RING_THICKNESS * 2,
          height: CAP_SIZE + RING_THICKNESS * 2,
          borderRadius: '50%',
          background: 'conic-gradient(#d881f4, #80deea, #ffd54f, #f48fb1, #b39ddb, #d881f4)',
          opacity: revealed ? 0 : 1,
          transition: 'opacity 0.4s',
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{ width: CAP_SIZE, height: CAP_SIZE, borderRadius: '50%', background: CAP_COLOR }}
        >
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
            <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Flash */}
      <div
        className="absolute inset-0 z-50 pointer-events-none"
        style={{ background: 'white', opacity: showFlash ? 1 : 0, transition: showFlash ? 'none' : 'opacity 0.15s' }}
      />

      {/* Ripples */}
      {ripples.map((key) => (
        <motion.div
          key={key}
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 50, opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.2, 0.9, 0.2, 1] }}
          className="absolute z-40 pointer-events-none"
          style={{ bottom: 0, left: '50%', width: 10, height: 10, marginLeft: -5, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.9)' }}
        />
      ))}

      {/* Particles */}
      {particles.map((p) => (
        <ParticleDot key={p.id} p={p} />
      ))}
    </div>
  );
}

function ParticleDot({ p }: { p: Particle }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let x = 0;
    let y = 0;
    const vx = p.vx;
    let vy = p.vy;
    let life = 60;
    let frame: number;

    const tick = () => {
      x += vx;
      y += vy;
      vy += 0.12;
      life--;
      if (ref.current) {
        ref.current.style.transform = `translate(${x}px, ${y}px)`;
        ref.current.style.opacity = `${Math.max(0, life / 60)}`;
      }
      if (life > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [p]);

  return (
    <div
      ref={ref}
      className="absolute z-50 pointer-events-none"
      style={{ bottom: 0, left: '50%', width: p.size, height: p.size, borderRadius: '50%', backgroundColor: p.color }}
    />
  );
}
