/**
 * HeroWalletStep - the wallet screen the SPAR gift lands on after redeeming,
 * ported from nexus-wallet's WalletPage SPAR-gift flow and condensed for the
 * hero phone frame. It reproduces the real journey's three beats via the
 * `phase` prop:
 *   - 'deck'   : the wallet card deck centred on the SPAR gift card, the Nexus
 *                balance card peeking behind (like `/he/wallet?focus=uv_spar_gift`).
 *   - 'open'   : the gift card auto-taps and flips to its pay/redeem side (the
 *                real VoucherCard flip-to-pay).
 *   - 'accrue' : the deck slides to the Nexus balance card, which counts the
 *                earned cashback (SPAR_DEMO_CASHBACK = 15) up from 0 - the real
 *                BalanceCard count-up - with a "+15" credit chip flying into it.
 *
 * Router / auth / stores are stubbed (no navigation); reuses the ported
 * VoucherCard, BalanceCard and WalletDeck. Header is a minimal, faithful
 * stand-in for the wallet TopBar (logo + profile + balance pill + bell).
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, User } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatCurrency';
import VoucherCard from '../wallet/VoucherCard';
import BalanceCard from '../wallet/BalanceCard';
import WalletDeck, { type DeckCard } from '../wallet/WalletDeck';
import TransactionSuccessShell from '../wallet/TransactionSuccessShell';
import type { UserVoucher } from '../../types/voucher.types';

// The SPAR gift payment demo, from WalletPage's SPAR_DEMO_AMOUNT / _CASHBACK.
const SPAR_DEMO_AMOUNT = 150;
const SPAR_DEMO_CASHBACK = 15;
// Shorter spin so the payment demo's result is visible within its dwell.
const PAY_SPIN_MS = 1000;
const DECK_HEIGHT = 262;

export type WalletPhase = 'deck' | 'open' | 'pay' | 'accrue';

interface HeroWalletStepProps {
  phase: WalletPhase;
  userVoucher: UserVoucher;
  reduce: boolean | null;
}

export default function HeroWalletStep({ phase, userVoucher, reduce }: HeroWalletStepProps) {
  const { language } = useLanguage();
  const he = language === 'he';
  const locale = he ? 'he-IL' : 'en-IL';
  const isRTL = he;

  const activeIndex = phase === 'accrue' ? 1 : 0;
  // The gift card stays flipped to its pay side through 'open' and while the
  // payment-demo screen ('pay') plays over the wallet.
  const giftFlipped = phase === 'open' || phase === 'pay';
  const accruing = phase === 'accrue';
  const balanceValue = accruing ? SPAR_DEMO_CASHBACK : 0;
  const balanceFrom = accruing ? 0 : undefined;

  const cards: DeckCard[] = [
    {
      id: 'gift',
      node: (
        <div className="w-full flex items-center justify-center" style={{ minHeight: 262 }}>
          <VoucherCard userVoucher={userVoucher} flipped={giftFlipped} onExpire={() => {}} />
        </div>
      ),
    },
    {
      id: 'balance',
      node: (
        <div className="w-full flex items-center justify-center" style={{ minHeight: 262 }}>
          <BalanceCard
            balance={balanceValue}
            countFrom={balanceFrom}
            logoCorner
            className="w-full"
            style={{ aspectRatio: '1510 / 952' }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="absolute inset-0 z-[90] overflow-hidden bg-white" dir={he ? 'rtl' : 'ltr'}>
      {/* Decorative wallet gradient backdrop (the wallet hero band). */}
      <div aria-hidden className="absolute top-0 inset-x-0 h-[240px] pointer-events-none z-0">
        <div
          className="w-full h-full opacity-[0.14]"
          style={{ background: 'linear-gradient(135deg, #ffb74d 0%, #ff91b8 35%, #9c88ff 65%, #80deea 100%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 60%, #ffffff 100%)' }}
        />
      </div>

      <div className="relative z-10 h-full flex flex-col pt-9 px-3">
        {/* Minimal wallet top bar - logo + profile cluster, balance pill, bell. */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="relative flex items-center">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.14)] -me-2.5 z-0">
                <img src="/nexus-logo.png" alt="Nexus" className="w-5 h-5 object-contain rounded-full" />
              </div>
              <div className="relative z-10 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.14)]">
                <User size={16} className="text-text-secondary" />
              </div>
            </div>
            <div
              className="rounded-full bg-white flex items-center shadow-[0_6px_16px_rgba(0,0,0,0.14)] h-7 px-2.5"
            >
              <span className="font-semibold tracking-tight text-text-primary tabular-nums text-[11px]" dir="ltr">
                {formatCurrency(balanceValue, 'ILS', locale)}
              </span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] text-text-muted font-medium">{he ? 'בוקר טוב' : 'Good morning'}</span>
              <span className="text-[11px] font-bold text-text-primary">רז</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.14)]">
            <Bell size={16} className="text-text-secondary" />
          </div>
        </div>

        {/* Card deck. */}
        <div className="relative mt-6 px-1">
          <WalletDeck cards={cards} activeIndex={activeIndex} isRTL={isRTL} deckHeight={DECK_HEIGHT} reduce={reduce} />

          {/* Cashback credit chip - flies up into the balance as it accrues. */}
          <AnimatePresence>
            {accruing && (
              <motion.div
                key="cashback-chip"
                className="absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none"
                style={{ top: 6 }}
                initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 40, scale: 0.8 }}
                animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: [40, 0, -6, -30], scale: [0.8, 1, 1, 0.9] }}
                transition={{ duration: reduce ? 0 : 1.8, times: [0, 0.25, 0.7, 1], ease: 'easeOut' }}
              >
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/95 text-white text-xs font-extrabold px-3 py-1 shadow-lg shadow-emerald-500/30 tabular-nums" dir="ltr">
                  +{formatCurrency(SPAR_DEMO_CASHBACK, 'ILS', locale)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Caption under the deck - mirrors the wallet's cashback framing. */}
        <p className="mt-5 text-center text-[11px] font-semibold text-text-secondary">
          {accruing
            ? he ? 'הקאשבק נטען ליתרת נקסוס שלך' : 'Cashback credited to your Nexus balance'
            : he ? 'המתנה שלך מחכה בארנק' : 'Your gift is waiting in the wallet'}
        </p>
      </div>

      {/* Payment demonstration - the REAL TransactionSuccessShell the wallet
          opens when the gift card's "Simulate payment" is tapped. */}
      {phase === 'pay' && (
        <motion.div
          className="absolute inset-0 z-[110] bg-white"
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.3 }}
        >
          <TransactionSuccessShell
            compact
            reduce={reduce}
            spinMs={PAY_SPIN_MS}
            autoMs={0}
            cashback={SPAR_DEMO_CASHBACK}
            isHe={he}
            iconUrl="/tenants/spar-official.svg"
            onClose={() => {}}
          >
            <div className="px-4 pt-3 divide-y divide-border text-[13px]" dir={he ? 'rtl' : 'ltr'}>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-text-secondary">{he ? 'בית עסק' : 'Merchant'}</span>
                <span className="font-semibold">SPAR</span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-text-secondary">{he ? 'סכום עסקה' : 'Amount'}</span>
                <span className="font-semibold" dir="ltr">₪{SPAR_DEMO_AMOUNT}.00</span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-text-secondary">{he ? 'קאשבק שנצבר' : 'Cashback earned'}</span>
                <span className="font-semibold text-green-600" dir="ltr">+₪{SPAR_DEMO_CASHBACK}.00</span>
              </div>
            </div>
          </TransactionSuccessShell>
        </motion.div>
      )}
    </div>
  );
}
