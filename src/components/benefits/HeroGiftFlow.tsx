/**
 * HeroGiftFlow - the REAL nexus-wallet SPAR gift journey (reference:
 * /he/gift-sample?tenant=spar -> /he/wallet?focus=uv_spar_gift) ported 1:1 into
 * the welfare landing hero, rendered inside a dark phone frame and AUTO-PLAYING
 * on a continuous loop.
 *
 * Loop phases:
 *   'cover'        - gradient cover card (SPAR white logo over the warm
 *                    gift-mesh wash, "רז, קיבלת מתנה מ-SPAR!", CTA, Nexus mark).
 *   'letter'       - 3D flip to the dark-navy SPAR "שנה טובה" letter (עמית זאב /
 *                    SPAR ישראל), with the REAL VoucherCard gift below.
 *   'redeem'       - the REAL PremiumRevealContent celebration (bubbles).
 *   'walletDeck'   - lands on the wallet: the SPAR gift card in the card deck,
 *                    the Nexus balance card peeking (HeroWalletStep).
 *   'walletOpen'   - the gift card auto-taps + flips to its pay/redeem side.
 *   'walletAccrue' - the deck slides to the Nexus balance card, which counts the
 *                    earned cashback up from 0 with a credit chip.
 * Then it loops back to 'cover'.
 *
 * Stubs (no router / auth / tenant store): tenant is always 'spar', nothing
 * navigates. Where GiftSamplePage/WalletPage would authStore.login + navigate to
 * the wallet, the flow instead advances through the ported wallet steps and then
 * bumps a `cycle` counter, which re-runs the timer effect and replays forever.
 *
 * Auto-play timers all live in one ref, cleared on unmount and on every cycle
 * reset. prefers-reduced-motion drops the flip/bob/scroll/spring transitions but
 * still cycles. Phone frame reuses the StoryWalletCards bezel. Default export.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import VoucherCard from '../wallet/VoucherCard';
import { PremiumRevealContent } from './PremiumReveal';
import HeroWalletStep, { type WalletPhase } from './HeroWalletStep';
import { mockUserVouchers } from '../../mock/data/vouchers.mock';

const HOME_GRADIENT = 'linear-gradient(135deg, #ffb74d 0%, #ff91b8 35%, #9c88ff 65%, #80deea 100%)';
const NEXUS_WIDE_WHITE = '/nexus-white-wide-logo.png';
const RECIPIENT = 'רז';

// The SPAR variant, ported verbatim from GiftSamplePage VARIANTS.spar.
const SPAR = {
  redeemVoucherId: 'uv_spar_gift',
  gradient: HOME_GRADIENT,
  logo: '/tenants/spar-official.svg',
  heroImage: '/gift-cards/rosh-hashana.png',
  sender: 'SPAR',
  coverTitle: `${RECIPIENT}, קיבלת מתנה מ-SPAR!`,
  letterBg: '#0a2540',
  letterAccent: '#7dd3fc',
  letterHeading: 'לכל צוות העובדים\nוהעובדות שלנו,',
  letterBody: [
    'עם בואה של השנה החדשה, אני רוצה לעצור לרגע ולהודות לכל אחת ואחד מכם.',
    'SPAR היא הרבה יותר מסניפים ומדפים - היא האנשים. אתם אלה שמקבלים את הלקוחות בכניסה, שדואגים שכל מוצר יהיה במקומו, שנותנים שירות בחיוך גם בימים העמוסים. המסירות, המקצועיות והלב שאתם מביאים מדי יום הם הלב הפועם של הרשת, ואני אסיר תודה על כך.',
    'שתהיה לכולנו שנה של צמיחה, של הצלחות משותפות ושל סיפוק - בעבודה ובבית כאחד.',
    'שנה טובה, מתוקה ובריאה לכם ולכל בני משפחותיכם - שתתמלא בשמחה, בבריאות ובהגשמה.',
  ],
  letterClosingSmall: 'בברכה,',
  signature: 'עמית זאב',
  senderBig: 'SPAR ישראל',
  redeemLine: 'ממשו בעשרות רשתות',
};

type Phase = 'cover' | 'letter' | 'redeem' | 'walletDeck' | 'walletOpen' | 'walletPay' | 'walletAccrue';

// Auto-play dwell times (ms).
const COVER_MS = 3200;
const SCROLL_AT = COVER_MS + 1400;
const REDEEM_AT = COVER_MS + 4800;
const REVEAL_HOLD_MS = 4200;
const WALLET_DECK_MS = 3000;
const WALLET_OPEN_MS = 2600;
const WALLET_PAY_MS = 3600;
const WALLET_ACCRUE_MS = 3600;

const WALLET_PHASE: Record<string, WalletPhase> = {
  walletDeck: 'deck',
  walletOpen: 'open',
  walletPay: 'pay',
  walletAccrue: 'accrue',
};

export default function HeroGiftFlow() {
  const { language } = useLanguage();
  const dir = language === 'he' ? 'rtl' : 'ltr';
  const reduce = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('cover');
  const [cycle, setCycle] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);

  const userVoucher = mockUserVouchers.find((v) => v.id === SPAR.redeemVoucherId)!;

  const revealed = phase !== 'cover';
  const redeeming = phase === 'redeem';
  const inWallet = phase === 'walletDeck' || phase === 'walletOpen' || phase === 'walletPay' || phase === 'walletAccrue';

  const push = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  // Auto-play timeline for the cover -> letter -> redeem legs. Restarts on each
  // `cycle` bump (a loop reset). The wallet legs are scheduled from finishRedeem
  // into the same timer ref, so this cleanup clears them too.
  useEffect(() => {
    clearTimers();
    setPhase('cover');
    mainRef.current?.scrollTo({ top: 0 });
    push(() => setPhase('letter'), COVER_MS);
    push(() => {
      const el = mainRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    }, SCROLL_AT);
    push(() => setPhase('redeem'), REDEEM_AT);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle, reduce]);

  // The celebration finished -> continue into the wallet journey:
  // land on the deck -> auto-tap the gift open -> pay demonstration ->
  // cashback accrues to the Nexus balance -> loop.
  const finishRedeem = () => {
    const tOpen = WALLET_DECK_MS;
    const tPay = tOpen + WALLET_OPEN_MS;
    const tAccrue = tPay + WALLET_PAY_MS;
    const tLoop = tAccrue + WALLET_ACCRUE_MS;
    setPhase('walletDeck');
    push(() => setPhase('walletOpen'), tOpen);
    push(() => setPhase('walletPay'), tPay);
    push(() => setPhase('walletAccrue'), tAccrue);
    push(() => setCycle((c) => c + 1), tLoop);
  };

  const flipTrans = { duration: reduce ? 0 : 0.4, ease: 'easeOut' as const };

  return (
    <div className="relative" dir={dir}>
      {/* Soft glow behind the phone (reads well on the dark navy hero). */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[90px] z-0 pointer-events-none"
        style={{ width: 360, height: 520, background: 'rgba(255,145,184,0.18)', filter: 'blur(58px)' }}
      />

      {/* Phone frame (matches StoryWalletCards bezel). */}
      <motion.div
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
        className="relative z-10"
        style={{
          width: 310,
          aspectRatio: '9 / 18.8',
          borderRadius: 42,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04)), #0b0f1a',
          padding: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 30px 80px rgba(7,10,20,0.35)',
        }}
      >
        <div className="absolute pointer-events-none" style={{ inset: 7, borderRadius: 35, border: '1px solid rgba(255,255,255,0.08)' }} />

        {/* Screen */}
        <div className="w-full h-full relative overflow-hidden" style={{ borderRadius: 34, background: '#ffffff' }}>
          {/* Notch */}
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-[100]"
            style={{ width: 112, height: 22, background: 'rgba(10,37,64,0.85)', borderRadius: '0 0 15px 15px' }}
          />

          {/* Decorative gradient glow - the SPAR wash, at the top. */}
          <div className="absolute top-0 inset-x-0 h-[210px] pointer-events-none z-0">
            <div className="w-full h-full opacity-[0.18]" style={{ background: SPAR.gradient }} />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 60%, #ffffff 100%)' }}
            />
          </div>

          {/* Scrollable body - cover / letter / gift. */}
          <div
            ref={mainRef}
            className={`absolute inset-0 z-10 overflow-y-auto scrollbar-hide px-4 ${revealed ? 'pt-8 pb-7' : 'flex items-start justify-center pt-9 pb-4'}`}
          >
            <div className="w-full">
              {/* Greeting - 3D flip from the cover to the full letter. */}
              <div className="flip-perspective w-full">
                <AnimatePresence mode="wait" initial={false}>
                  {!revealed ? (
                    <motion.div
                      key="cover"
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ rotateY: 90, opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.35, ease: 'easeIn' }}
                      className="relative w-full aspect-[10/16] rounded-2xl flex flex-col items-center justify-between p-4 overflow-hidden"
                      style={{
                        background: SPAR.gradient,
                        color: '#ffffff',
                        boxShadow: '0 20px 34px -16px rgba(14, 44, 84, 0.45)',
                        backfaceVisibility: 'hidden',
                      }}
                    >
                      <div
                        className="absolute inset-0 z-0 pointer-events-none"
                        style={{ background: 'linear-gradient(to bottom, rgba(10,37,64,0.28) 0%, rgba(10,37,64,0.05) 35%, rgba(10,37,64,0.18) 75%, rgba(10,37,64,0.4) 100%)' }}
                      />

                      <img
                        src={SPAR.logo}
                        alt={SPAR.sender}
                        className="relative z-10 w-[78%] h-auto object-contain drop-shadow-lg"
                        style={{ filter: 'brightness(0) invert(1)' }}
                      />

                      <div className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center animate-gift-float my-1.5">
                        <img src={SPAR.heroImage} alt="" aria-hidden className="max-w-[78%] max-h-full object-contain drop-shadow-xl rounded-xl" />
                      </div>

                      <div className="relative z-10 w-full space-y-3">
                        <h2 className="text-lg font-extrabold text-center leading-tight" style={{ textShadow: '0 1px 14px rgba(10,37,64,0.5)' }}>
                          {SPAR.coverTitle}
                        </h2>
                        <div className="flex flex-col items-center gap-2.5 pt-0.5">
                          <div className="w-full bg-bg-dark text-white py-3 px-4 rounded-full font-bold text-sm text-center shadow-lg shadow-bg-dark/30">
                            גלה את המתנה
                          </div>
                          <img src={NEXUS_WIDE_WHITE} alt="Nexus" className="h-7 w-auto" />
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="letter"
                      initial={{ rotateY: -90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={flipTrans}
                      className="w-full rounded-2xl p-5 text-start"
                      style={{ background: SPAR.letterBg, boxShadow: '0 20px 34px -16px rgba(0, 0, 0, 0.45)', backfaceVisibility: 'hidden' }}
                    >
                      <h2 className="text-xl font-black text-white leading-tight whitespace-pre-line">{SPAR.letterHeading}</h2>
                      <div className="mt-3">
                        {SPAR.letterBody.map((para, i) => (
                          <p key={i} className={`text-xs font-medium text-white/80 leading-relaxed ${i > 0 ? 'mt-2.5' : ''}`}>
                            {para}
                          </p>
                        ))}
                        <p className="mt-3.5 text-xs font-semibold text-white/80">{SPAR.letterClosingSmall}</p>
                        <p className="mt-2 text-base font-bold text-white">{SPAR.signature}</p>
                        <p className="mt-3 text-xl font-bold" style={{ color: SPAR.letterAccent }}>
                          {SPAR.senderBig}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Gift - the REAL wallet voucher card. */}
              {revealed && (
                <section className="mt-6 animate-fade-in">
                  <h3 className="text-base font-bold text-text-primary mb-3 text-start">המתנה שלך</h3>
                  <div className="w-full block">
                    <VoucherCard userVoucher={userVoucher} flipped={false} onExpire={() => {}} />
                  </div>
                  <div className="mt-5 w-full bg-bg-dark text-white py-3 rounded-full font-bold text-sm text-center shadow-lg shadow-bg-dark/30">
                    למימוש המתנה
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Redeem celebration - the REAL PremiumRevealContent. */}
          {redeeming && (
            <div className="absolute inset-0 z-[80] overflow-hidden" style={{ background: '#f6f9fc' }} dir="rtl">
              <PremiumRevealContent autoReveal revealHoldMs={REVEAL_HOLD_MS} onReveal={finishRedeem} />

              <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center px-6 pointer-events-none">
                <motion.div
                  className="w-[240px]"
                  initial={reduce ? { opacity: 1 } : { opacity: 0, y: 120, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: reduce ? 0 : 0.95, ease: [0.22, 1, 0.36, 1] }}
                >
                  <VoucherCard userVoucher={userVoucher} flipped={false} onExpire={() => {}} />
                </motion.div>
                <motion.p
                  className="mt-6 text-lg font-extrabold text-white text-center"
                  style={{ textShadow: '0 2px 16px rgba(0,0,0,0.45)' }}
                  initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduce ? 0 : 0.7, duration: 0.5 }}
                >
                  {SPAR.redeemLine}
                </motion.p>
              </div>
            </div>
          )}

          {/* Wallet journey - lands on the wallet, opens the card, accrues cashback. */}
          {inWallet && (
            <motion.div
              className="absolute inset-0 z-[90]"
              initial={reduce ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.4 }}
            >
              <HeroWalletStep phase={WALLET_PHASE[phase]} userVoucher={userVoucher} reduce={reduce} />
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
