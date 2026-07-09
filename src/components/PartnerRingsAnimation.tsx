import { useEffect, useRef } from 'react';
import type { Partner } from './PartnerCard';

// ─── Ring configuration ───────────────────────────────────────
const RINGS = [
  { speed: 0.0022, direction:  1, radius: 160 },
  { speed: 0.0016, direction: -1, radius: 330 },
  { speed: 0.0012, direction:  1, radius: 500 },
] as const;

const CIRCLE_SIZE = 120;
const GAP = 8;
// Below this container width the rings render scaled down inside a bottom strip
// (mobile) instead of the full hero overlay, so bubbles never cover the headline.
const MOBILE_BREAKPOINT = 640;
const MOBILE_SCALE = 0.6;

// ─── Internal types ───────────────────────────────────────────
interface CircleObj {
  wrapper: HTMLDivElement;
  inner: HTMLDivElement;
  angle: number;
  radius: number;
  speed: number;
  direction: number;
}

interface Props {
  partners: Partner[];
  language: string;
}

// ─── Component ────────────────────────────────────────────────
export default function PartnerRingsAnimation({ partners, language }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!partners.length || !containerRef.current) return;
    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();

    // Mobile: the container is a short bottom strip - shrink circles + radii so the
    // rings fit under the hero text instead of sweeping over it.
    const isMobile = width < MOBILE_BREAKPOINT;
    const scale = isMobile ? MOBILE_SCALE : 1;
    const circleSize = CIRCLE_SIZE * scale;

    // Center = bottom-right corner for LTR, bottom-left corner for RTL (Hebrew).
    // Mobile uses a much smaller offset so the rings sit higher in the strip.
    const offset = isMobile ? 12 : 80;
    const centerX = language === 'he' ? -offset : width + offset;
    const centerY = height + offset;

    const circles: CircleObj[] = [];
    let partnerIdx = 0;

    RINGS.forEach((ring) => {
      const ringRadius = ring.radius * scale;
      const count = Math.floor((2 * Math.PI * ringRadius) / (circleSize + GAP));
      for (let c = 0; c < count; c++) {
        const partner = partners[partnerIdx++ % partners.length];

        // ── Outer wrapper: handles position via rAF (no pointer events) ──
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          position:absolute;
          width:${circleSize}px;
          height:${circleSize}px;
          top:0; left:0;
          pointer-events:none;
          will-change:transform;
        `;

        // ── Inner div: visual circle + 3D hover effect ──
        // Hover behaviour identical to the home-page feature cards (Features.tsx):
        //   onMouseMove → perspective(1000px) rotateX/Y + scale3d(1.1)
        //   onMouseLeave → reset with 0.5s ease-out
        const inner = document.createElement('div');
        inner.style.cssText = `
          width:100%; height:100%;
          border-radius:50%;
          background:white;
          overflow:hidden;
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 8px 24px rgba(0,0,0,0.10);
          padding:10px;
          pointer-events:auto;
          transform-style:preserve-3d;
          transition:transform 0.1s ease-out, box-shadow 0.25s;
        `;

        const img = document.createElement('img');
        img.src = partner.thumbnailUrl;
        img.alt = partner.title;
        img.style.cssText = 'width:100%; height:100%; object-fit:contain; pointer-events:none;';
        img.loading = 'lazy';

        inner.appendChild(img);
        wrapper.appendChild(inner);
        container.appendChild(wrapper);

        // ── 3D tilt listeners ──
        inner.addEventListener('mousemove', (e) => {
          const r = inner.getBoundingClientRect();
          const x = e.clientX - r.left;
          const y = e.clientY - r.top;
          const rotateX = -((y - circleSize / 2) / 8);
          const rotateY = (x - circleSize / 2) / 8;
          inner.style.transition = 'transform 0.1s ease-out, box-shadow 0.25s';
          inner.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.1,1.1,1.1)`;
          inner.style.boxShadow = '0 16px 40px rgba(99,91,255,0.25)';
        });

        inner.addEventListener('mouseleave', () => {
          inner.style.transition = 'transform 0.5s ease-out, box-shadow 0.25s';
          inner.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
          inner.style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)';
        });

        circles.push({
          wrapper,
          inner,
          angle: (c / count) * Math.PI * 2,
          radius: ringRadius,
          speed: ring.speed,
          direction: ring.direction,
        });
      }
    });

    // ── rAF animation loop ──
    let rafId: number;

    function animate() {
      circles.forEach((c) => {
        c.angle += c.speed * c.direction;
        const tx = centerX + Math.cos(c.angle) * c.radius - circleSize / 2;
        const ty = centerY + Math.sin(c.angle) * c.radius - circleSize / 2;
        c.wrapper.style.transform = `translate(${tx}px,${ty}px)`;
      });
      rafId = requestAnimationFrame(animate);
    }

    animate();

    // ── Cleanup on unmount / partners change ──
    return () => {
      cancelAnimationFrame(rafId);
      circles.forEach((c) => c.wrapper.remove());
    };
  }, [partners, language]);

  return (
    // Mobile: short clipped strip pinned under the hero text (inside the hero's
    // bottom padding). Desktop (sm+): full hero overlay, unchanged.
    <div
      ref={containerRef}
      className="absolute inset-x-0 bottom-0 h-64 overflow-hidden sm:inset-0 sm:h-auto
                 [mask-image:linear-gradient(to_bottom,transparent_0,black_72px)] sm:[mask-image:none]"
      style={{ pointerEvents: 'none' }}
    />
  );
}
