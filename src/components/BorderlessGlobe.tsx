import { useEffect, useRef } from 'react';

// @ts-ignore - topojson loaded via script tag
declare const topojson: any;

interface BorderlessGlobeProps {
  isHovered?: boolean;
}

export default function BorderlessGlobe({ isHovered = false }: BorderlessGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shouldAnimateRef = useRef(isHovered);
  const animationTimeRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let LAND_MULTI_POLY: any = null;

    // Math helpers
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    function rotY(p: any, ang: number) {
      const c = Math.cos(ang), s = Math.sin(ang);
      return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
    }

    function rotX(p: any, ang: number) {
      const c = Math.cos(ang), s = Math.sin(ang);
      return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
    }

    function project(p: any, cx: number, cy: number, r: number) {
      const depth = 2.9;
      const k = depth / (depth - p.z);
      return { x: cx + p.x * r * k, y: cy + p.y * r * k, k };
    }

    function resize() {
      const dpr = 1; // Fixed at 1 for better performance
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Dots - drastically reduced for performance
    const dots: any[] = [];
    const DOTS = 300;
    const LAND_EXTRA_DOTS = 200;

    function pointInRing(lon: number, lat: number, ring: any) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function pointInPolygonWithHoles(lon: number, lat: number, polygon: any) {
      if (!polygon || polygon.length === 0) return false;
      if (!pointInRing(lon, lat, polygon[0])) return false;
      for (let i = 1; i < polygon.length; i++) {
        if (pointInRing(lon, lat, polygon[i])) return false;
      }
      return true;
    }

    function isLandLonLat(lon: number, lat: number) {
      if (!LAND_MULTI_POLY) return false;
      for (const poly of LAND_MULTI_POLY) {
        if (pointInPolygonWithHoles(lon, lat, poly)) return true;
      }
      return false;
    }

    function isLandXYZ(x: number, y: number, z: number) {
      const lat = Math.asin(y) * 180 / Math.PI;
      const lon = Math.atan2(z, x) * 180 / Math.PI;
      return isLandLonLat(lon, lat);
    }

    async function loadLand() {
      if (typeof topojson === 'undefined') return false;

      try {
        const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) return false;
        const topo = await res.json();

        const landObj = topo?.objects?.land;
        if (!landObj) return false;

        let geom = null;
        if (landObj.type === 'GeometryCollection' && Array.isArray(landObj.geometries)) {
          geom = topojson.merge(topo, landObj.geometries);
        } else {
          const feat = topojson.feature(topo, landObj);
          if (feat?.type === 'FeatureCollection' && Array.isArray(feat.features) && feat.features.length) {
            geom = feat.features[0]?.geometry || null;
          } else {
            geom = feat?.geometry || null;
          }
        }

        if (!geom || !geom.coordinates) return false;

        if (geom.type === 'Polygon') {
          LAND_MULTI_POLY = [geom.coordinates];
        } else if (geom.type === 'MultiPolygon') {
          LAND_MULTI_POLY = geom.coordinates;
        }

        return true;
      } catch {
        return false;
      }
    }

    function buildDots() {
      dots.length = 0;

      for (let i = 0; i < DOTS; i++) {
        const t = i / (DOTS - 1);
        const inc = Math.PI * (3 - Math.sqrt(5));
        const y = 1 - 2 * t;
        const rad = Math.sqrt(1 - y * y);
        const phi = i * inc;
        const x = Math.cos(phi) * rad;
        const z = Math.sin(phi) * rad;
        dots.push({ x, y, z, seed: Math.random(), land: isLandXYZ(x, y, z) });
      }

      const EXTRA = LAND_MULTI_POLY ? LAND_EXTRA_DOTS : 0;
      let added = 0;
      while (added < EXTRA) {
        const u = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(1 - u * u);
        const x = rr * Math.cos(theta);
        const y = u;
        const z = rr * Math.sin(theta);
        if (isLandXYZ(x, y, z)) {
          dots.push({ x, y, z, seed: Math.random(), land: true });
          added++;
        }
      }
    }

    // Pre-allocate buffer for dot sorting (avoids creating new arrays every frame)
    const ptsBuffer = dots.map(d => ({ p: { x: d.x, y: d.y, z: d.z }, seed: d.seed, land: d.land }));

    // Grid
    const grid: any[] = [];
    function addLatitude(latDeg: number, step = 7) {
      const lat = latDeg * Math.PI / 180;
      const line = [];
      for (let a = 0; a <= 360; a += step) {
        const lon = a * Math.PI / 180;
        line.push({ x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon) });
      }
      grid.push(line);
    }

    function addLongitude(lonDeg: number, step = 6) {
      const lon = lonDeg * Math.PI / 180;
      const line = [];
      for (let a = -90; a <= 90; a += step) {
        const lat = a * Math.PI / 180;
        line.push({ x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon) });
      }
      grid.push(line);
    }

    [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75].forEach(d => addLatitude(d, 8));
    [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].forEach(d => addLongitude(d, 7));

    // Arcs
    function sphToXYZ(lonDeg: number, latDeg: number) {
      const lon = lonDeg * Math.PI / 180, lat = latDeg * Math.PI / 180;
      return { x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon) };
    }

    function makeArc(p1: any, p2: any, steps = 40) {
      const dot = clamp(p1.x * p2.x + p1.y * p2.y + p1.z * p2.z, -1, 1);
      const omega = Math.acos(dot);
      const sinO = Math.sin(omega) || 1e-6;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const s1 = Math.sin((1 - t) * omega) / sinO;
        const s2 = Math.sin(t * omega) / sinO;
        let p = { x: p1.x * s1 + p2.x * s2, y: p1.y * s1 + p2.y * s2, z: p1.z * s1 + p2.z * s2 };
        const lift = Math.pow(Math.sin(Math.PI * t), 1.25) * 0.12;
        p = { x: p.x * (1 + lift), y: p.y * (1 + lift), z: p.z * (1 + lift) };
        const m = Math.hypot(p.x, p.y, p.z);
        pts.push({ x: p.x / m, y: p.y / m, z: p.z / m });
      }
      return pts;
    }

    const arcEndpoints = [
      [[5, 18], [96, 10]],
      [[-74, 36], [28, -16]],
      [[12, -12], [144, 34]],
      [[-14, 44], [-148, -6]],
      [[62, -24], [-38, 16]],
      [[120, -5], [-8, 10]],
      [[-110, 18], [40, 40]],
      [[30, -35], [-70, 15]],
    ];
    const arcs = arcEndpoints.map(([a, b]) => makeArc(sphToXYZ(a[0], a[1]), sphToXYZ(b[0], b[1])));

    const draw = (now: number) => {
      // Update animation time only when shouldAnimate is true
      if (shouldAnimateRef.current) {
        if (lastFrameTimeRef.current !== null) {
          const deltaMs = now - lastFrameTimeRef.current;
          animationTimeRef.current += deltaMs;
        }
        lastFrameTimeRef.current = now;
      } else {
        // When not animating, reset lastFrameTimeRef so there's no jump when resuming
        lastFrameTimeRef.current = null;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.52;
      const r = Math.min(w, h) * 0.42;

      // Use accumulated animation time instead of raw timestamp
      const t = animationTimeRef.current / 1000;
      const initialYaw = -20 * Math.PI / 180;
      const rotYBase = initialYaw + t * 0.08;
      const rotXBase = -0.22 + Math.sin(t * 0.08) * 0.04;

      // Halo - reduced opacity for seamless blend
      ctx.save();
      const halo = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.45);
      halo.addColorStop(0, 'rgba(0,212,255,0.08)');
      halo.addColorStop(0.45, 'rgba(99,91,255,0.04)');
      halo.addColorStop(0.72, 'rgba(156,92,255,0.03)');
      halo.addColorStop(0.88, 'rgba(255,122,89,0.02)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Rim - removed for seamless background blend

      // Grid - brighter purple matching border gradient
      ctx.strokeStyle = 'rgba(147,51,234,.90)';
      ctx.lineWidth = 0.5;
      for (const line of grid) {
        ctx.beginPath();
        let started = false;
        for (const p0 of line) {
          let p = rotY(p0, rotYBase);
          p = rotX(p, rotXBase);
          if (p.z < -0.02) { started = false; continue; }
          const pr = project(p, cx, cy, r);
          if (!started) { ctx.moveTo(pr.x, pr.y); started = true; }
          else ctx.lineTo(pr.x, pr.y);
        }
        ctx.stroke();
      }

      // Arcs
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      arcs.forEach((line, idx) => {
        let first = null, last = null;
        for (const p0 of line) {
          let p = rotY(p0, rotYBase);
          p = rotX(p, rotXBase);
          if (p.z <= 0) continue;
          const pr = project(p, cx, cy, r);
          if (!first) first = pr;
          last = pr;
        }

        const g = first && last ? ctx.createLinearGradient(first.x, first.y, last.x, last.y) : null;
        if (g) {
          // Border highlight gradient: purple → pink → orange (MUCH stronger)
          g.addColorStop(0, 'rgba(147,51,234,.85)');
          g.addColorStop(0.5, 'rgba(236,72,153,.75)');
          g.addColorStop(1, 'rgba(251,146,60,.70)');
          ctx.strokeStyle = g;
        } else {
          ctx.strokeStyle = 'rgba(147,51,234,.75)';
        }

        ctx.lineWidth = 0.8;
        ctx.beginPath();
        let started = false;
        for (const p0 of line) {
          let p = rotY(p0, rotYBase);
          p = rotX(p, rotXBase);
          if (p.z <= 0) { started = false; continue; }
          const pr = project(p, cx, cy, r);
          if (!started) { ctx.moveTo(pr.x, pr.y); started = true; }
          else ctx.lineTo(pr.x, pr.y);
        }
        ctx.stroke();

        // Pulses - reduced from 3 to 1 per arc
        const speeds = [0.26];
        speeds.forEach((sp, j) => {
          const phase = (t * sp + idx * 0.17 + j * 0.33) % 1;
          const i = Math.floor(phase * (line.length - 1));
          const p0 = line[i];
          let p = rotY(p0, rotYBase);
          p = rotX(p, rotXBase);
          if (p.z <= 0) return;
          const pr = project(p, cx, cy, r);
          const R = 8 + j * 2;
          const pg = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, R);
          pg.addColorStop(0, 'rgba(246,249,252,.70)');
          pg.addColorStop(0.35, 'rgba(147,51,234,.45)');
          pg.addColorStop(0.65, 'rgba(236,72,153,.30)');
          pg.addColorStop(1, 'rgba(251,146,60,0)');
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, R, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      ctx.restore();

      // Dots
      const palette = [
        [0, 212, 255],
        [99, 91, 255],
        [156, 92, 255],
        [246, 249, 252],
        [255, 122, 89],
        [255, 90, 122],
        [255, 184, 77]
      ];

      for (let i = 0; i < ptsBuffer.length; i++) {
        const d = dots[i];
        let p = rotY(d, rotYBase + d.seed * 0.35);
        p = rotX(p, rotXBase);
        ptsBuffer[i].p = p; ptsBuffer[i].seed = d.seed; ptsBuffer[i].land = d.land;
      }
      ptsBuffer.sort((a, b) => a.p.z - b.p.z);
      const pts = ptsBuffer;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (const { p, seed, land } of pts) {
        if (p.z < -0.10) continue;
        const pr = project(p, cx, cy, r);
        const edge = clamp((p.z + 0.15) / 1.15, 0, 1);
        const tw = 0.75 + 0.25 * Math.sin(t * 0.5 + seed * 12);

        let alpha = lerp(0.05, 0.45, edge) * tw;
        let size = lerp(0.7, 1.6, edge) * (0.8 + seed * 0.6);

        const idx = Math.floor(seed * palette.length);
        const [rC, gC, bC] = palette[idx];

        if (land) {
          alpha *= 2.2;
          size *= 2.2;
        } else {
          alpha *= 0.30;
          size *= 0.55;
        }

        ctx.fillStyle = `rgba(${rC},${gC},${bC},${alpha})`;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ALWAYS schedule next frame - loop never stops
      requestAnimationFrame(draw);
    };

    async function init() {
      resize();
      window.addEventListener('resize', resize);

      // Skip land loading for performance - use random distribution
      buildDots();

      // Draw first frame and start animation loop
      requestAnimationFrame(draw);
    }

    init();

    return () => {
      window.removeEventListener('resize', resize);
      shouldAnimateRef.current = false;
    };
  }, []);

  // Update animation control ref when hover state changes
  useEffect(() => {
    shouldAnimateRef.current = isHovered;
  }, [isHovered]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" style={{ background: 'transparent' }} />
    </div>
  );
}
