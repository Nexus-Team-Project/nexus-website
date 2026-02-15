import { useEffect, useState } from 'react';
import './CardStackAnimation.css';
import visaLogo from '../assets/logos/visa-logo.png';
import mastercardLogo from '../assets/logos/mastercard-logo.png';

const names = [
  'Alex Morgan', 'Jordan Lee', 'Maya Cohen', 'Daniel Park', 'Noah Rivera',
  'Emma Wilson', 'Liam Carter', 'Ava Martinez', 'Ethan Brooks', 'Sofia Ramirez',
  'Ben Adler', 'Yael Cohen', 'Omer Levi', 'Nina Patel', 'Lucas Meyer'
];

function shuffle(arr: string[]): string[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CardStackAnimation() {
  const [cardNames, setCardNames] = useState<string[]>([]);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Initialize names
    const pool = shuffle(names);
    setCardNames([pool[0], 'Jordan Lee', pool[2]]);

    // Match the 7.2s stack loop
    const interval = setInterval(() => {
      const pool = shuffle(names);
      setCardNames([pool[0], 'Jordan Lee', pool[2]]);
    }, 7200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card-stack-hero">
      <div className="card-stack" aria-hidden="true">
        {/* Animated Grid Background */}
        <div className="grid-background">
          <div className="grid-lines"></div>
          <div className="grid-pulse pulse-1"></div>
          <div className="grid-pulse pulse-2"></div>
          <div className="grid-pulse pulse-3"></div>
          <div className="grid-pulse pulse-4"></div>
          <div className="grid-glow"></div>
        </div>

        <div className="card card--visa">
          <div className="card__shine"></div>
          <div className="card__art"></div>
          <div className="card__logo">
            {!imageErrors.has('visa') ? (
              <img
                src={visaLogo}
                alt="Visa"
                className="card__logo-img"
                onError={() => setImageErrors(prev => new Set(prev).add('visa'))}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/20 rounded">
                <span className="text-white font-bold text-sm">VISA</span>
              </div>
            )}
          </div>
          <div className="card__numbers">••••  ••••  ••••  4821</div>
          <div className="card__name">{cardNames[0]}</div>
        </div>

        <div className="card card--mc">
          <div className="card__shine"></div>
          <div className="card__art"></div>
          <div className="card__logo">
            {!imageErrors.has('mastercard') ? (
              <img
                src={mastercardLogo}
                alt="Mastercard"
                className="card__logo-img"
                onError={() => setImageErrors(prev => new Set(prev).add('mastercard'))}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/20 rounded">
                <span className="text-white font-bold text-xs">MC</span>
              </div>
            )}
          </div>
          <div className="card__numbers">••••  ••••  ••••  9384</div>
          <div className="card__name">{cardNames[1]}</div>
        </div>

        <div className="card card--biz">
          <div className="card__shine"></div>
          <div className="card__art"></div>
          <div className="card__logo logo--biz">
            <span className="biz-mark"></span>
            <span className="biz-text">Business</span>
          </div>
          <div className="card__numbers">••••  ••••  ••••  1056</div>
          <div className="card__name">{cardNames[2]}</div>
        </div>

        <span className="particle p1"></span>
        <span className="particle p2"></span>
        <span className="particle p3"></span>
        <span className="particle p4"></span>
      </div>
    </div>
  );
}

