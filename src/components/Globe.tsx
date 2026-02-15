import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string[];
}

export default function MoneyGlobe() {
  const globeEl = useRef<any>();
  const [arcsData, setArcsData] = useState<Arc[]>([]);

  useEffect(() => {
    // Financial hubs
    const hubs = [
      { lat: 40.7128, lng: -74.0060, name: 'New York' },
      { lat: 51.5074, lng: -0.1278, name: 'London' },
      { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
      { lat: 1.3521, lng: 103.8198, name: 'Singapore' },
      { lat: 22.3193, lng: 114.1694, name: 'Hong Kong' },
      { lat: 52.5200, lng: 13.4050, name: 'Berlin' },
      { lat: -33.8688, lng: 151.2093, name: 'Sydney' },
      { lat: 19.4326, lng: -99.1332, name: 'Mexico City' },
    ];

    // Generate random arcs between hubs
    const generateArcs = () => {
      const newArcs: Arc[] = [];
      const numArcs = 15;

      for (let i = 0; i < numArcs; i++) {
        const start = hubs[Math.floor(Math.random() * hubs.length)];
        let end = hubs[Math.floor(Math.random() * hubs.length)];

        // Ensure start and end are different
        while (end === start) {
          end = hubs[Math.floor(Math.random() * hubs.length)];
        }

        // Random color from our palette
        const colors = [
          ['rgba(99, 102, 241, 0.8)', 'rgba(99, 102, 241, 0.3)'], // Purple
          ['rgba(0, 212, 255, 0.8)', 'rgba(0, 212, 255, 0.3)'], // Cyan
          ['rgba(251, 146, 60, 0.8)', 'rgba(251, 146, 60, 0.3)'], // Orange
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];

        newArcs.push({
          startLat: start.lat,
          startLng: start.lng,
          endLat: end.lat,
          endLng: end.lng,
          color: color,
        });
      }

      setArcsData(newArcs);
    };

    generateArcs();

    // Regenerate arcs every 3 seconds
    const interval = setInterval(generateArcs, 3000);

    // Auto-rotate
    if (globeEl.current && globeEl.current.controls) {
      const controls = globeEl.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
      }
    }

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-full">
      <Globe
        ref={globeEl}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        arcsData={arcsData}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={3000}
        arcStroke={0.5}
        arcsTransitionDuration={0}
        atmosphereColor="#6366f1"
        atmosphereAltitude={0.15}
      />
    </div>
  );
}
