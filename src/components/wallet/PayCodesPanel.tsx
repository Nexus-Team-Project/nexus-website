/**
 * PayCodesPanel - ported from nexus-wallet (src/components/wallet/PayCodesPanel.tsx)
 * and made self-contained for the website hero: the wallet's `t.wallet.*`
 * strings are inlined (he/en via useLanguage), the router `useParams` lang is
 * derived from the language context, the material-symbols glyphs are swapped
 * for lucide-react icons, and the PayCodeInfoSheet dependency is dropped (the
 * help button is a no-op in the hero, where this panel is the never-shown flip
 * side of the SPAR gift VoucherCard).
 *
 * Codes half of the in-store payment UI - QR/barcode switcher, the code, and a
 * copy button. `compact` is the wallet-deck flip-side layout used by VoucherCard.
 */
import { useState } from 'react';
import { Barcode as BarcodeIcon, Check, Copy, HelpCircle, Info, QrCode } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

const PAYMENT_CODE = 'NXS-7526-4821';

interface PayCodesPanelProps {
  compact?: boolean;
  code?: string;
  qrSrc?: string;
  roundedClass?: string;
  /** Fixed promotion-stacking state (vouchers). When omitted, user-toggleable. */
  stacking?: boolean;
  hideTitle?: boolean;
  surface?: boolean;
  /** Overrides the help button (opens a custom flow instead of the tooltip). */
  onInfo?: () => void;
}

/** Inlined he/en copy (was `t.wallet.*` in the wallet i18n bundle). */
function strings(he: boolean) {
  return {
    includesStacking: he ? 'כולל כפל מבצעים' : 'Includes deal stacking',
    excludesStacking: he ? 'לא כולל כפל מבצעים' : 'Excludes deal stacking',
    moreInfo: he ? 'מידע נוסף' : 'More info',
    learnMore: he ? 'למד עוד' : 'Learn more',
    payInStoreTitle: he ? 'שלם בחנות וקבל קאשבק עד 60% הנחה' : 'Pay in store & get up to 60% cashback',
    dontShareCode: he ? 'אל תשתף את הקוד הזה עם אחרים' : 'Do not share this code with others',
    codeHelpTooltip: he
      ? 'הצג/י את הקוד לקופאי/ת בקופה. זהו קוד מולטיפס - אל תיתן/י שימנעו ממך את ההנחה.'
      : 'Show this code to the cashier at checkout. It is a Multipass code - do not let them deny you the discount.',
  };
}

export default function PayCodesPanel({
  compact = false,
  code = PAYMENT_CODE,
  qrSrc = '/qr-code.png',
  roundedClass = 'rounded-[22px]',
  stacking,
  hideTitle = false,
  surface = false,
  onInfo,
}: PayCodesPanelProps) {
  const { language } = useLanguage();
  const isHe = language === 'he';
  const t = strings(isHe);
  const [copied, setCopied] = useState(false);
  const [codeView, setCodeView] = useState<'qr' | 'barcode'>('barcode');
  const [showHelp, setShowHelp] = useState(false);
  const stackingFixed = stacking !== undefined;
  const [includesStackingState, setIncludesStacking] = useState(true);
  const includesStacking = stackingFixed ? (stacking as boolean) : includesStackingState;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // QR / barcode segmented switcher - shared between both layouts. `small`
  // shrinks it for the compact (phone-frame flip-side) layout.
  const switcher = (small = false) => {
    const dim = small ? 'w-6 h-6' : 'w-8 h-8';
    const ic = small ? 14 : 18;
    return (
      <div
        role="group"
        aria-label={isHe ? 'בחר תצוגה' : 'View mode'}
        className="flex items-center bg-white shadow-md rounded-full p-0.5"
      >
        <button
          type="button"
          onClick={() => setCodeView('qr')}
          aria-pressed={codeView === 'qr'}
          aria-label={isHe ? 'הצג QR' : 'Show QR'}
          className={`${dim} rounded-full flex items-center justify-center transition-colors active:scale-95 ${
            codeView === 'qr' ? 'bg-surface' : ''
          }`}
        >
          <QrCode size={ic} className={codeView === 'qr' ? 'text-text-primary' : 'text-text-muted'} />
        </button>
        <button
          type="button"
          onClick={() => setCodeView('barcode')}
          aria-pressed={codeView === 'barcode'}
          aria-label={isHe ? 'הצג ברקוד' : 'Show barcode'}
          className={`${dim} rounded-full flex items-center justify-center transition-colors active:scale-95 ${
            codeView === 'barcode' ? 'bg-surface' : ''
          }`}
        >
          <BarcodeIcon size={ic} className={codeView === 'barcode' ? 'text-text-primary' : 'text-text-muted'} />
        </button>
      </div>
    );
  };

  // QR glyph with the centred Nexus badge, at a given pixel size.
  const qr = (px: number, badge: string) => (
    <div className="relative flex items-center justify-center">
      <img src={qrSrc} alt="QR Code" width={px} height={px} style={{ display: 'block' }} />
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full flex items-center justify-center shadow-md overflow-hidden ${badge}`}
      >
        <img src="/nexus-icon.png" alt="Nexus" className="w-full h-full rounded-full object-cover p-px" />
        <div
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(255,255,255,0) 42%, rgba(255,255,255,0.45) 66%, rgba(255,255,255,0.85) 84%, #fff 100%)',
          }}
        />
      </div>
    </div>
  );

  // ── Compact (wallet-deck flip side) ──
  if (compact) {
    return (
      <div
        className={`relative h-full overflow-hidden bg-white ${roundedClass} border border-border shadow-[0_8px_30px_rgb(0,0,0,0.06)] px-2.5 pt-8 pb-8 flex flex-col`}
        dir={isHe ? 'rtl' : 'ltr'}
      >
        <div className="absolute top-2 right-2 z-20">{switcher(true)}</div>

        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="w-full max-w-full overflow-hidden bg-surface rounded-xl px-3 py-2.5 flex flex-col items-center gap-1.5">
            {!stackingFixed && (
              <span className="text-[10px] font-bold text-text-primary text-center">
                {includesStacking ? t.includesStacking : t.excludesStacking}
              </span>
            )}
            {codeView === 'qr' ? qr(84, 'w-6 h-6') : (
              <img src="/barcode.png" alt="Barcode" className="w-full max-w-[150px] h-auto object-contain" style={{ maxHeight: 30 }} />
            )}
            <div className="flex items-center justify-center gap-1.5 max-w-full">
              <p className="text-sm font-bold text-text-primary tracking-[0.08em] truncate">{code}</p>
              <button
                onClick={handleCopy}
                className="p-1 rounded-lg hover:bg-white active:scale-95 transition-all"
                title="Copy"
              >
                {copied ? <Check size={15} className="text-text-muted" /> : <Copy size={15} className="text-text-muted" />}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (onInfo ? onInfo() : setShowHelp((v) => !v))}
          aria-label={onInfo ? t.learnMore : t.moreInfo}
          className="absolute bottom-1.5 left-1.5 z-20 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center transition-colors active:scale-95"
        >
          <HelpCircle size={16} className="text-text-muted" />
        </button>

        {!stackingFixed && (
          <button
            type="button"
            onClick={() => setIncludesStacking((v) => !v)}
            aria-pressed={includesStacking}
            aria-label={includesStacking ? t.includesStacking : t.excludesStacking}
            className={`absolute bottom-1.5 right-1.5 z-20 w-10 h-6 rounded-full transition-colors ${
              includesStacking ? 'bg-text-secondary' : 'bg-border'
            }`}
          >
            <div
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all"
              style={{ insetInlineStart: includesStacking ? '18px' : '2px' }}
            />
          </button>
        )}
      </div>
    );
  }

  // ── Full layout (balance-detail page) ──
  return (
    <div
      className={`${
        surface
          ? 'bg-surface rounded-2xl border border-border'
          : 'bg-white rounded-3xl border border-border shadow-[0_8px_30px_rgb(0,0,0,0.06)]'
      } px-6 pb-6 pt-4`}
      dir={isHe ? 'rtl' : 'ltr'}
    >
      {!hideTitle && (
        <h2 className="text-lg font-bold text-text-primary text-center mb-3">{t.payInStoreTitle}</h2>
      )}

      <div className="relative rounded-2xl border border-border p-3 mb-3 min-h-[150px] flex items-center justify-center">
        <div className="absolute top-2 start-2 z-10">{switcher()}</div>

        {codeView === 'qr' && qr(126, 'w-9 h-9')}
        {codeView === 'barcode' && (
          <img src="/barcode.png" alt="Barcode" width={170} height={44} style={{ display: 'block' }} />
        )}

        <div className="absolute bottom-2 end-2 z-20">
          <button
            type="button"
            onClick={() => (onInfo ? onInfo() : setShowHelp((v) => !v))}
            aria-expanded={showHelp}
            aria-label={onInfo ? t.learnMore : t.moreInfo}
            className="w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center transition-colors active:scale-95"
          >
            <Info size={18} className={showHelp ? 'text-text-primary' : 'text-text-muted'} />
          </button>
          {showHelp && (
            <div
              role="tooltip"
              className="absolute bottom-full end-0 mb-2 w-56 bg-white rounded-xl border border-border shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-3 text-xs text-text-secondary leading-relaxed animate-fade-in"
            >
              {t.codeHelpTooltip}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mb-1">
        <p className="text-lg font-bold text-text-primary tracking-[0.2em]">{code}</p>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg hover:bg-surface active:scale-95 transition-all"
          title="Copy"
        >
          {copied ? <Check size={18} className="text-text-muted" /> : <Copy size={18} className="text-text-muted" />}
        </button>
      </div>

      <p className="text-xs text-text-secondary text-center">{t.dontShareCode}</p>
    </div>
  );
}
