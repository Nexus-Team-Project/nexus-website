/**
 * StoryNearbyMap — adapted from nexus-wallet NearbyMapPage.tsx
 * Section 4: "נציג לך איפה ההטבות הכי שוות"
 * Leaflet map inside phone mockup with animated route and brand offer bubbles.
 */
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLanguage } from '../../i18n/LanguageContext';

// ── Real Tel Aviv coordinates ──
const USER_LATLNG: [number, number] = [32.0636, 34.7721];
const DEST_LATLNG: [number, number] = [32.0753, 34.7748];

const ROUTE_COORDS: [number, number][] = [
  [32.0636, 34.7721], [32.0640, 34.7718], [32.0644, 34.7714], [32.0648, 34.7710],
  [32.0652, 34.7706], [32.0656, 34.7702], [32.0659, 34.7700], [32.0663, 34.7697],
  [32.0667, 34.7695], [32.0671, 34.7693], [32.0675, 34.7690], [32.0679, 34.7688],
  [32.0682, 34.7688], [32.0686, 34.7693], [32.0690, 34.7698], [32.0693, 34.7705],
  [32.0698, 34.7710], [32.0703, 34.7714], [32.0708, 34.7718], [32.0713, 34.7722],
  [32.0718, 34.7726], [32.0722, 34.7730], [32.0726, 34.7733], [32.0730, 34.7736],
  [32.0735, 34.7740], [32.0739, 34.7742], [32.0743, 34.7744], [32.0748, 34.7746],
  [32.0753, 34.7748],
];

const FILL_STEPS = ROUTE_COORDS.length;

const routeOffers = [
  { brand: 'Golf & Co',      logo: '/brands/golf.png',           discount: '20%', routeIndex: 5 },
  { brand: 'American Eagle', logo: '/brands/american-eagle.png', discount: '15%', routeIndex: 10 },
  { brand: 'Carrefour',      logo: '/brands/carrefour.png',      discount: '10%', routeIndex: 16 },
  { brand: 'Mango',          logo: '/brands/mango.png',          discount: '25%', routeIndex: 22 },
  { brand: 'Samsung',        logo: '/brands/samsung.png',        discount: '30%', routeIndex: 27 },
];

// Preload logos
if (typeof window !== 'undefined') {
  routeOffers.forEach(({ logo }) => { const i = new Image(); i.src = logo; });
}

// ── Leaflet custom icons ──
const userIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:20px;height:20px;">
    <div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(99,91,255,0.4);animation:nearbyPulse 2s ease-out infinite;"></div>
    <div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(99,91,255,0.3);animation:nearbyPulse 2s ease-out infinite 1s;"></div>
    <div style="width:20px;height:20px;background:#0d9488;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(99,91,255,0.5);position:relative;z-index:2;"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const destIcon = L.divIcon({
  className: '',
  html: `<svg width="28" height="40" viewBox="0 0 24 34" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z" fill="#ef4444"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
});

function createOfferIcon(logo: string, discount: string) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:44px;height:44px;">
      <div style="width:44px;height:44px;border-radius:50%;background:white;box-shadow:0 4px 16px rgba(0,0,0,0.25);border:2.5px solid white;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${logo}" style="width:26px;height:26px;object-fit:contain;" />
      </div>
      <div style="position:absolute;top:-8px;right:-14px;background:#0d9488;color:white;font-size:10px;font-weight:800;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 8px rgba(99,91,255,0.5);line-height:1.4;">
        ${discount}
      </div>
    </div>`,
    iconSize: [60, 52],
    iconAnchor: [22, 22],
  });
}

function DisableInteractions() {
  const map = useMap();
  useEffect(() => {
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    if ((map as unknown as Record<string, unknown>).tap)
      (map as unknown as Record<string, { disable: () => void }>).tap.disable();
  }, [map]);
  return null;
}

export default function StoryNearbyMap() {
  const { language } = useLanguage();
  const he = language === 'he';

  const [phase, setPhase] = useState(0);
  const [fillIndex, setFillIndex] = useState(0);
  const [visibleBubbles, setVisibleBubbles] = useState(0);
  const [loopKey, setLoopKey] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const t = timersRef.current;
    t.forEach(clearTimeout);
    t.length = 0;

    setPhase(0);
    setFillIndex(0);
    setVisibleBubbles(0);

    t.push(setTimeout(() => setPhase(1), 400));
    t.push(setTimeout(() => setPhase(2), 1400));
    t.push(setTimeout(() => setPhase(3), 2200));

    const fillStartTime = 2400;
    const fillDuration = 2800;
    const stepDelay = fillDuration / FILL_STEPS;

    for (let i = 1; i <= FILL_STEPS; i++) {
      t.push(setTimeout(() => setFillIndex(i), fillStartTime + i * stepDelay));
    }

    routeOffers.forEach((offer, i) => {
      const bubbleTime = fillStartTime + offer.routeIndex * stepDelay + 100;
      t.push(setTimeout(() => setVisibleBubbles(i + 1), bubbleTime));
    });

    t.push(setTimeout(() => setPhase(5), 7000));
    t.push(setTimeout(() => {
      setPhase(0);
      setFillIndex(0);
      setVisibleBubbles(0);
      setTimeout(() => setLoopKey((k) => k + 1), 600);
    }, 9000));

    return () => { t.forEach(clearTimeout); t.length = 0; };
  }, [loopKey]);

  const centerLat = (USER_LATLNG[0] + DEST_LATLNG[0]) / 2;
  const centerLng = (USER_LATLNG[1] + DEST_LATLNG[1]) / 2;
  const filledCoords = ROUTE_COORDS.slice(0, fillIndex);

  return (
    <div className="w-full flex flex-col items-center justify-center px-6 relative overflow-hidden py-8" style={{ minHeight: 560 }}>
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className={`mb-5 w-full max-w-sm z-10 relative ${he ? 'text-right' : 'text-left'}`}
      >
        <h2 className="text-2xl font-semibold leading-relaxed text-slate-900">
          {he ? 'נציג לך איפה ההטבות הכי שוות מסביבך' : "We'll show you where the best deals are near you"}
        </h2>
        <p className="text-base font-normal mt-1 text-slate-500">
          {he ? 'בכל רגע נתון, בכל מקום' : 'Anytime, anywhere'}
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
        {/* Glow */}
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
          <div
            className="absolute pointer-events-none"
            style={{ inset: 7, borderRadius: 29, border: '1px solid rgba(255,255,255,0.08)' }}
          />

          {/* Screen */}
          <div
            className="w-full h-full relative overflow-hidden"
            style={{
              borderRadius: 28,
              WebkitMaskImage: 'radial-gradient(white, white)',
              maskImage: 'radial-gradient(white, white)',
            }}
          >
            {/* Notch */}
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-30"
              style={{
                width: 100, height: 22,
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '0 0 14px 14px',
                backdropFilter: 'blur(6px)',
              }}
            />

            {/* Leaflet map */}
            <div className="absolute inset-0 z-0">
              <MapContainer
                key={loopKey}
                center={[centerLat, centerLng]}
                zoom={15}
                className="w-full h-full"
                zoomControl={false}
                attributionControl={false}
              >
                <DisableInteractions />
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={20}
                />

                {phase >= 1 && <Marker position={USER_LATLNG} icon={userIcon} />}
                {phase >= 2 && <Marker position={DEST_LATLNG} icon={destIcon} />}

                {phase >= 3 && (
                  <Polyline
                    positions={ROUTE_COORDS}
                    pathOptions={{ color: '#0d9488', weight: 3, opacity: 0.2, dashArray: '8 6', lineCap: 'round', lineJoin: 'round' }}
                  />
                )}

                {fillIndex >= 2 && (
                  <Polyline
                    positions={filledCoords}
                    pathOptions={{ color: '#0d9488', weight: 4, opacity: 0.9, dashArray: '8 6', lineCap: 'round', lineJoin: 'round' }}
                  />
                )}

                {routeOffers.slice(0, visibleBubbles).map((offer) => (
                  <Marker
                    key={`${offer.brand}-${loopKey}`}
                    position={ROUTE_COORDS[offer.routeIndex]}
                    icon={createOfferIcon(offer.logo, offer.discount)}
                  />
                ))}
              </MapContainer>
            </div>

            {/* Bottom caption */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute bottom-0 left-0 right-0 z-20 text-center py-2.5 px-3"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(8px)',
                fontSize: 12,
                fontWeight: 600,
                color: '#1a1a2e',
              }}
            >
              {he ? 'נציג לך איפה ההטבות הכי שוות מסביבך בכל רגע נתון' : 'Showing the best deals near you in real time'}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      <style>{`
        @keyframes nearbyPulse {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(3); opacity: 0; }
        }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  );
}
