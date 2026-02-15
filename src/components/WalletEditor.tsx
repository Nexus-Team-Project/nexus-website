import { useState, useEffect, useRef } from 'react';
import './WalletEditor.css';

const WalletEditor = () => {
  const [balance, setBalance] = useState(3898);
  const [currency, setCurrency] = useState({ sym: '$', val: 3898 });
  const [isPaying, setIsPaying] = useState(false);
  const [currentColor, setCurrentColor] = useState({ a: '#6366f1', b: '#06b6d4' });

  const colors = [
    { a: '#6366f1', b: '#06b6d4' },
    { a: '#06b6d4', b: '#22c55e' },
    { a: '#22c55e', b: '#0ea5e9' },
    { a: '#f97316', b: '#fde047' },
    { a: '#111827', b: '#6b7280' },
    { a: '#7c3aed', b: '#ec4899' },
  ];

  const currencies = [
    { sym: '£', val: 3100, flag: 'gb', name: 'UK' },
    { sym: '$', val: 3898, flag: 'us', name: 'USA' },
    { sym: '€', val: 3580, flag: 'eu', name: 'EU' },
    { sym: '₪', val: 14500, flag: 'il', name: 'Israel' },
    { sym: '฿', val: 140000, flag: 'th', name: 'Thailand' },
    { sym: '₹', val: 325000, flag: 'in', name: 'India' },
    { sym: '¥', val: 590000, flag: 'jp', name: 'Japan' },
  ];

  const [activeCurrencyIndex, setActiveCurrencyIndex] = useState(1);
  const [colorIndex, setColorIndex] = useState(0);

  // Auto-cycle colors
  useEffect(() => {
    const interval = setInterval(() => {
      setColorIndex((prev) => {
        const next = (prev + 1) % colors.length;
        setCurrentColor(colors[next]);
        return next;
      });
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  // Tap to pay animation
  const handleTapToPay = () => {
    setIsPaying(true);
    setTimeout(() => setIsPaying(false), 900);
  };

  // Cycle currency
  const cycleCurrency = () => {
    const nextIndex = (activeCurrencyIndex + 1) % currencies.length;
    setActiveCurrencyIndex(nextIndex);
    setCurrency(currencies[nextIndex]);
  };

  return (
    <div className="wed-wrap">
      {/* LEFT PANEL */}
      <aside className="wed-panel left">
        <div className="wed-card">
          <div className="wed-card__head">
            <span>Wallet Modules</span>
            <span className="wed-mini">drag & config</span>
          </div>
          <div className="wed-list">
            <label className="wed-row">Cards <span className="wed-switch"><input checked type="checkbox" readOnly /><span></span></span></label>
            <label className="wed-row">Insurance Payouts <span className="wed-switch"><input checked type="checkbox" readOnly /><span></span></span></label>
            <label className="wed-row">Top-up <span className="wed-switch"><input checked type="checkbox" readOnly /><span></span></span></label>
            <label className="wed-row">Roundup <span className="wed-switch"><input type="checkbox" readOnly /><span></span></span></label>
            <label className="wed-row">Exchange <span className="wed-switch"><input checked type="checkbox" readOnly /><span></span></span></label>
          </div>
        </div>

        {/* Color Swatches */}
        <div className="wed-colorModal">
          <div className="wed-colorModal__head"><span>Color Model</span><span className="pill">Theme</span></div>
          <div className="wed-colorModal__body">
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#6b7280' }}>Swatches</div>
            <div className="wed-swatches">
              {colors.map((color, idx) => (
                <span
                  key={idx}
                  className="wed-swatch"
                  style={{ '--c': color.a } as React.CSSProperties}
                  onClick={() => setCurrentColor(color)}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* PHONE */}
      <div className="wed-phoneWrap">
        <div className="wed-phone">
          <div className="wed-screen">
            <div className="wed-topbar">
              <span>9:41</span>
              <span>LTE</span>
            </div>
            <div className="wed-hero">
              <span>Cards</span>
              <button className="wed-btn" type="button">+</button>
            </div>

            <div className="wed-cardCarousel">
              <div className="wed-paycard side left"></div>
              <div
                className={`wed-paycard main ${isPaying ? 'is-pay' : ''}`}
                style={{
                  background: `linear-gradient(135deg, ${currentColor.b}, ${currentColor.a})`,
                }}
              >
                <span className="wed-nfc"></span>
                <span className="wed-paid">Paid</span>
                Balance
                <br />
                <b>
                  {currency.sym}
                  {Math.round(currency.val).toLocaleString()}
                </b>
                <br />
                <br />
                MARIA PETROVA
                <span className="wed-visa">VISA</span>
              </div>
              <div className="wed-paycard side right"></div>
            </div>

            <div className="wed-actionsRow">
              <div className="wed-action" onClick={handleTapToPay}>
                <span className="ico">⌁</span>Tap
              </div>
              <div className="wed-action">
                <span className="ico">⇄</span>Send
              </div>
              <div className="wed-action">
                <span className="ico">＋</span>Top-up
              </div>
            </div>

            <div className="wed-activity">
              <div className="wed-activity__head">
                <div>Card Activity</div>
                <span>Today</span>
              </div>
              <div className="wed-tx">
                <div className="dot payout"></div>
                <div className="mid">
                  <div className="t">Insurance payout</div>
                  <div className="s">Claim settled</div>
                </div>
                <div className="amt pos">+ $250</div>
              </div>
              <div className="wed-tx">
                <div className="dot exchange"></div>
                <div className="mid">
                  <div className="t">Exchange</div>
                  <div className="s">USD → EUR</div>
                </div>
                <div className="amt">$120</div>
              </div>
              <div className="wed-tx">
                <div className="dot roundup"></div>
                <div className="mid">
                  <div className="t">Roundup</div>
                  <div className="s">Saved to benefits</div>
                </div>
                <div className="amt neg">- $3</div>
              </div>
            </div>

            <div className="wed-nav">
              <span>Home</span>
              <b>Wallet</b>
              <span>Benefits</span>
              <span>Profile</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <aside className="wed-panel right">
        <div className="wed-card">
          <div className="wed-card__head"><span>Capabilities</span><span className="wed-mini">on/off</span></div>
          <div className="wed-list">
            <label className="wed-row">Tap to Pay <span className="wed-switch"><input checked type="checkbox" readOnly /><span></span></span></label>
            <label className="wed-row">Online <span className="wed-switch"><input checked type="checkbox" readOnly /><span></span></span></label>
            <label className="wed-row">Payouts <span className="wed-switch"><input checked type="checkbox" readOnly /><span></span></span></label>
            <label className="wed-row" onClick={cycleCurrency}>FX Exchange <span className="wed-switch"><input checked type="checkbox" readOnly /><span></span></span></label>
          </div>
        </div>

        <div className="wed-card">
          <div className="wed-card__head"><span>Currencies</span><span className="wed-mini">scroll</span></div>
          <div className="wed-currencyRow">
            {currencies.map((cur, idx) => (
              <div
                key={cur.flag}
                className={`wed-currency ${idx === activeCurrencyIndex ? 'pulse' : ''}`}
                onClick={cycleCurrency}
              >
                <img
                  alt={cur.name}
                  src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${cur.flag}.svg`}
                />
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default WalletEditor;
