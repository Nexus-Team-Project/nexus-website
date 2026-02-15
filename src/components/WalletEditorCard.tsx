import { useState, useEffect, useRef } from 'react';
import './WalletEditor.css';

const colorSwatches = [
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

export default function WalletEditorCard() {
  const [cardGradient, setCardGradient] = useState('linear-gradient(135deg, #06b6d4, #6366f1)');
  const [isPaying, setIsPaying] = useState(false);
  const [balance, setBalance] = useState('$3,898');
  const [currencyIndex, setCurrencyIndex] = useState(1);
  const [pulsingCurrency, setPulsingCurrency] = useState<number | null>(null);
  const [showPayouts, setShowPayouts] = useState(false);
  const balanceCounterRef = useRef<number>(3898);

  const triggerPayAnimation = () => {
    setIsPaying(true);
    setTimeout(() => setIsPaying(false), 950);
  };

  const animateBalance = (from: number, to: number, duration = 1200) => {
    const start = performance.now();
    const currency = currencies[currencyIndex];

    const animate = (time: number) => {
      const elapsed = time - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;

      balanceCounterRef.current = current;
      setBalance(`${currency.sym}${Math.round(current).toLocaleString()}`);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  };

  const handlePayoutsToggle = (checked: boolean) => {
    setShowPayouts(checked);
    if (checked) {
      animateBalance(balanceCounterRef.current, balanceCounterRef.current + 2888);
    } else {
      const currency = currencies[currencyIndex];
      balanceCounterRef.current = currency.val;
      setBalance(`${currency.sym}${Math.round(currency.val).toLocaleString()}`);
    }
  };

  const cycleCurrency = () => {
    const nextIndex = (currencyIndex + 1) % currencies.length;
    setCurrencyIndex(nextIndex);

    const currency = currencies[nextIndex];
    balanceCounterRef.current = currency.val;
    setBalance(`${currency.sym}${Math.round(currency.val).toLocaleString()}`);

    setPulsingCurrency(nextIndex);
    setTimeout(() => setPulsingCurrency(null), 600);
  };

  const handleColorClick = (a: string, b: string) => {
    setCardGradient(`linear-gradient(135deg, ${b}, ${a})`);
  };

  // Auto-demo on mount
  useEffect(() => {
    const runDemo = async () => {
      await new Promise(r => setTimeout(r, 1000));

      for (const swatch of colorSwatches) {
        handleColorClick(swatch.a, swatch.b);
        await new Promise(r => setTimeout(r, 1400));
      }

      await new Promise(r => setTimeout(r, 900));
      triggerPayAnimation();
      await new Promise(r => setTimeout(r, 1900));

      handlePayoutsToggle(true);
      await new Promise(r => setTimeout(r, 2300));
      handlePayoutsToggle(false);
      await new Promise(r => setTimeout(r, 1400));

      await new Promise(r => setTimeout(r, 900));

      for (let i = 0; i < currencies.length; i++) {
        cycleCurrency();
        await new Promise(r => setTimeout(r, 1400));
      }
    };

    runDemo();
  }, []);

  return (
    <div className="wed-wrap wallet-editor-interactive" style={{ transform: 'scale(0.95)', transformOrigin: 'top center' }}>
      {/* LEFT PANEL */}
      <aside className="wed-panel left wallet-panel-left">
        <div className="wed-card">
          <div className="wed-card__head">
            <span>Wallet Modules</span>
            <span className="wed-mini">drag & config</span>
          </div>
          <div className="wed-list">
            <label className="wed-row">
              Cards
              <span className="wed-switch">
                <input defaultChecked type="checkbox" />
                <span></span>
              </span>
            </label>
            <label className="wed-row">
              Insurance Payouts
              <span className="wed-switch">
                <input
                  checked={showPayouts}
                  onChange={(e) => handlePayoutsToggle(e.target.checked)}
                  type="checkbox"
                />
                <span></span>
              </span>
            </label>
            <label className="wed-row">
              Top-up
              <span className="wed-switch">
                <input defaultChecked type="checkbox" />
                <span></span>
              </span>
            </label>
            <label className="wed-row">
              Exchange
              <span className="wed-switch">
                <input defaultChecked type="checkbox" />
                <span></span>
              </span>
            </label>
          </div>
        </div>

        <div className="wed-colorModal">
          <div className="wed-colorModal__head">
            <span>Color Model</span>
            <span className="pill">Theme</span>
          </div>
          <div className="wed-colorModal__body">
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#6b7280' }}>
              Swatches
            </div>
            <div className="wed-swatches">
              {colorSwatches.map((swatch, i) => (
                <span
                  key={i}
                  className="wed-swatch"
                  style={{ '--c': swatch.a } as React.CSSProperties}
                  onClick={() => handleColorClick(swatch.a, swatch.b)}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* PHONE */}
      <div className="wed-phoneWrap wallet-phone-center">
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
              <div className="wed-paycard side left" style={{ background: cardGradient }}></div>
              <div
                className={`wed-paycard main ${isPaying ? 'is-pay' : ''}`}
                style={{ background: cardGradient }}
              >
                <span className="wed-nfc"></span>
                <span className="wed-paid">Paid</span>
                Balance<br />
                <b>{balance}</b>
                <br /><br />
                MARIA PETROVA
                <span className="wed-visa">VISA</span>
              </div>
              <div className="wed-paycard side right" style={{ background: cardGradient }}></div>
            </div>

            <div className="wed-actionsRow">
              <div className="wed-action" onClick={triggerPayAnimation}>
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
            </div>

            <div className="wed-nav">
              <span>Home</span>
              <b>Wallet</b>
              <span>Benefits</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <aside className="wed-panel right wallet-panel-right">
        <div className="wed-card">
          <div className="wed-card__head">
            <span>Capabilities</span>
            <span className="wed-mini">on/off</span>
          </div>
          <div className="wed-list">
            <label className="wed-row">
              Tap to Pay
              <span className="wed-switch">
                <input
                  defaultChecked
                  type="checkbox"
                  onChange={(e) => e.target.checked && triggerPayAnimation()}
                />
                <span></span>
              </span>
            </label>
            <label className="wed-row">
              Payouts
              <span className="wed-switch">
                <input
                  checked={showPayouts}
                  onChange={(e) => handlePayoutsToggle(e.target.checked)}
                  type="checkbox"
                />
                <span></span>
              </span>
            </label>
            <label
              className="wed-row"
              onClick={(e) => {
                e.preventDefault();
                cycleCurrency();
              }}
            >
              FX Exchange
              <span className="wed-switch">
                <input checked readOnly type="checkbox" />
                <span></span>
              </span>
            </label>
          </div>
        </div>

        <div className="wed-card">
          <div className="wed-card__head">
            <span>Currencies</span>
            <span className="wed-mini">scroll</span>
          </div>
          <div className="wed-currencyRow">
            {currencies.map((currency, i) => (
              <div
                key={i}
                className={`wed-currency ${pulsingCurrency === i ? 'pulse' : ''}`}
              >
                <img
                  alt={currency.name}
                  src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${currency.flag}.svg`}
                />
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
