import { useState, useEffect } from 'react';
import './SpendingLimits.css';

const cards = [
  { name: 'אסעד אקבאני', number: '•••• 9048' },
  { name: 'בן בייארד', number: '•••• 1171' },
  { name: 'מאיה כהן', number: '•••• 7176' },
  { name: 'נועם גרין', number: '•••• 0666' },
  { name: 'ליאם פוקס', number: '•••• 9599' },
];

export default function SpendingLimitsAnimation() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<'step1' | 'step2'>('step1');
  const [showMap, setShowMap] = useState(false);

  const activeCard = cards[activeIndex];
  const pickedText = `נבחר: ${activeCard.name} · ${activeCard.number}`;

  // Cycle cards
  useEffect(() => {
    const interval = setInterval(() => {
      if (mode === 'step1') {
        setActiveIndex((prev) => (prev + 1) % cards.length);
      }
    }, 1400);
    return () => clearInterval(interval);
  }, [mode]);

  // Toggle steps
  useEffect(() => {
    const interval = setInterval(() => {
      setMode((prev) => {
        if (prev === 'step1') {
          setShowMap(true);
          return 'step2';
        } else {
          setShowMap(false);
          return 'step1';
        }
      });
    }, 4200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="spending-stage">
      {/* List */}
      <div className="spending-list">
        <div className="spending-row spending-head">
          <span>מספר כרטיס</span>
          <span>שם</span>
        </div>
        {cards.map((card, i) => (
          <div
            key={i}
            className={`spending-row ${i === activeIndex ? 'active' : ''}`}
            onClick={() => setActiveIndex(i)}
          >
            <span className="spending-dots">{card.number}</span>
            <span className="spending-name">{card.name}</span>
          </div>
        ))}
      </div>

      {/* Step 1 */}
      <div className={`spending-modal ${mode === 'step2' ? 'hidden' : ''}`}>
        <div className="spending-title">הגדרת מגבלת הוצאה</div>
        <div className="spending-pill">{pickedText}</div>

        <div className="spending-field">
          <div className="spending-label">סכום</div>
          <div className="spending-group">
            <div className="spending-select">לחודש ▾</div>
            <div className="spending-input">
              <strong>₪</strong>100.00
            </div>
          </div>
        </div>

        <div className="spending-field">
          <div className="spending-label">קטגוריות</div>
          <div className="spending-select">בחר ▾</div>
          <div className="spending-chips">
            <div className="spending-chip allowed">
              <span className="spending-icon">✓</span>מרפאות
            </div>
            <div className="spending-chip allowed">
              <span className="spending-icon">✓</span>תחנות דלק
            </div>
            <div className="spending-chip blocked">
              <span className="spending-icon">✕</span>אלכוהול
            </div>
            <div className="spending-chip blocked">
              <span className="spending-icon">✕</span>הימורים
            </div>
          </div>
        </div>

        <div className="spending-actions">
          <button className="spending-btn" type="button">
            ביטול
          </button>
          <button className="spending-btn primary" type="button">
            המשך
          </button>
        </div>
      </div>

      {/* Step 2 */}
      <div className={`spending-modal spending-modal-step2 ${mode === 'step1' ? 'hidden' : ''}`}>
        <div className="spending-title">מגבלות מתקדמות</div>
        <div className="spending-pill">{pickedText}</div>

        <div className="spending-field spending-grid">
          <div>
            <div className="spending-label">חלון זמן</div>
            <div className="spending-select">08:00–18:00 ▾</div>
          </div>
          <div>
            <div className="spending-label">אזור שימוש</div>
            <div className="spending-select">מדינה / עיר ▾</div>
          </div>
        </div>

        <div className="spending-field">
          <div className="spending-label">אזור גאוגרפי מאושר</div>
          <div className={`spending-map ${showMap ? 'pulse' : ''}`}>
            <svg viewBox="0 0 300 160" className="spending-map-svg">
              <defs>
                <linearGradient id="mapbg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fafafa" />
                  <stop offset="100%" stopColor="#f3f4f6" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="300" height="160" rx="12" fill="url(#mapbg)" />
              <rect x="18" y="22" width="72" height="38" rx="8" fill="#f1f5f9" />
              <rect x="118" y="18" width="64" height="34" rx="8" fill="#f1f5f9" />
              <rect x="206" y="28" width="66" height="36" rx="8" fill="#f1f5f9" />
              <rect x="26" y="86" width="84" height="44" rx="8" fill="#f1f5f9" />
              <rect x="142" y="84" width="96" height="46" rx="8" fill="#f1f5f9" />
              <g stroke="#e5e7eb" strokeWidth="2" fill="none" strokeLinecap="round">
                <path d="M0,48 H300" />
                <path d="M0,104 H300" />
                <path d="M60,0 V160" />
                <path d="M150,0 V160" />
                <path d="M240,0 V160" />
              </g>
              <path
                className={`spending-poly ${showMap ? 'animate' : ''}`}
                d="M70,115 L110,65 L170,55 L225,80 L205,120 Z"
                fill="rgba(79,70,229,0.22)"
                stroke="#4f46e5"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>

        <div className="spending-field">
          <div className="spending-label">נדרש אישור מאת</div>
          <div className="spending-select">מנהל פיננסי ▾</div>
        </div>

        <div className="spending-actions">
          <button className="spending-btn" type="button">
            חזרה
          </button>
          <button className="spending-btn primary" type="button">
            אישור ושמירה
          </button>
        </div>
      </div>
    </div>
  );
}
