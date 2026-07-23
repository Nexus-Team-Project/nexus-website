// SummaryStep - static mock of the review + payment screen (step 5, סיכום).
// Reproduces the amount pill, the order-summary card and the payment options.
// Micro-animation: the summary lines check off / fill in one by one, the amount
// pill counts up, and the selected payment method gently pulses. Loops so it
// reads as live. Respects prefers-reduced-motion (settles on the final state).
import { useEffect, useState, type ComponentType } from 'react';
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from 'framer-motion';
import { CalendarDays, Gift, Users, Mail, Check, CreditCard, Wallet, ChevronLeft } from 'lucide-react';
import WizardShell from './WizardShell';

const SUMMARY = {
  event: { name: 'חגיגת סוף שנה', date: '31/12/2024' },
  gift: { brand: 'Amazon', type: 'גיפט קארד דיגיטלי' },
  recipients: { count: 15, totalAmount: 3750 },
  greeting: { type: 'אימייל', hasCustomMessage: true },
};

interface SummaryRow {
  icon: ComponentType<{ className?: string }>;
  title: string;
  line1: string;
  line2?: string;
  amount?: string;
}

const ROWS: SummaryRow[] = [
  { icon: CalendarDays, title: 'אירוע', line1: SUMMARY.event.name, line2: SUMMARY.event.date },
  { icon: Gift, title: 'מתנה', line1: SUMMARY.gift.brand, line2: SUMMARY.gift.type },
  { icon: Users, title: 'נמענים', line1: `${SUMMARY.recipients.count} נמענים`, amount: `₪${SUMMARY.recipients.totalAmount.toLocaleString()}` },
  { icon: Mail, title: 'ברכה', line1: SUMMARY.greeting.type, line2: '✓ הודעה מותאמת אישית' },
];

const SummaryStep = () => {
  const reduce = useReducedMotion();

  // Amount pill counts up, then holds and loops.
  const amount = useMotionValue(0);
  const amountText = useTransform(amount, (v) => Math.round(v).toLocaleString());

  // Summary rows check off one at a time.
  const [revealed, setRevealed] = useState(ROWS.length);

  useEffect(() => {
    if (reduce) {
      amount.set(SUMMARY.recipients.totalAmount);
      return;
    }
    const controls = animate(amount, [0, SUMMARY.recipients.totalAmount], {
      duration: 2.4,
      ease: 'easeOut',
      repeat: Infinity,
      repeatDelay: 2.8,
    });
    return () => controls.stop();
  }, [reduce, amount]);

  useEffect(() => {
    if (reduce) {
      setRevealed(ROWS.length);
      return;
    }
    setRevealed(0);
    const id = setInterval(() => {
      setRevealed((prev) => (prev >= ROWS.length ? 0 : prev + 1));
    }, 750);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <WizardShell title="סיכום והשלמת תשלום" subtitle="שלב 5 מתוך 5 - סקירה אחרונה לפני השליחה" activeStep={5}>
      <div className="flex flex-col items-center max-w-3xl mx-auto w-full">
        <div className="text-center space-y-3 mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">איך תרצו לשלם על המתנות?</h2>
          <p className="text-lg text-slate-600 font-medium">בחרו את שיטת התשלום שנוחה לכם - ויאללה, מתחילים להפיץ אושר!</p>
          <div className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-primary/10 rounded-full">
            <span className="text-slate-600">סכום לתשלום</span>
            <span className="text-2xl font-bold text-primary tabular-nums">
              ₪<motion.span>{amountText}</motion.span>
            </span>
          </div>
        </div>

        <div className="w-full grid grid-cols-2 gap-6">
          {/* Order Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <h3 className="text-lg font-bold text-slate-900 mb-3">סיכום ההזמנה</h3>
            {ROWS.map((row, i) => {
              const on = i < revealed;
              const Icon = row.icon;
              return (
                <div
                  key={row.title}
                  className={`flex items-start gap-4 p-4 rounded-xl transition-colors duration-500 ${on ? 'bg-slate-50' : 'bg-slate-50/40'}`}
                >
                  <div className="relative w-6 h-6 flex-shrink-0">
                    <Icon className={`w-6 h-6 transition-colors duration-500 ${on ? 'text-primary' : 'text-slate-300'}`} />
                    {on && (
                      <motion.span
                        initial={reduce ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                        className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center"
                      >
                        <Check className="w-2.5 h-2.5 text-white" />
                      </motion.span>
                    )}
                  </div>
                  <div className={`flex-1 transition-opacity duration-500 ${on ? 'opacity-100' : 'opacity-40'}`}>
                    <div className="font-semibold text-slate-900">{row.title}</div>
                    <div className="text-sm text-slate-600">{row.line1}</div>
                    {row.line2 && <div className={`text-xs ${row.line2.startsWith('✓') ? 'text-green-600' : 'text-slate-500'}`}>{row.line2}</div>}
                  </div>
                  {row.amount && <div className={`text-sm font-bold text-slate-900 transition-opacity duration-500 ${on ? 'opacity-100' : 'opacity-40'}`}>{row.amount}</div>}
                </div>
              );
            })}
          </div>

          {/* Payment Methods */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-center mb-3 text-slate-900">בחרו אמצעי תשלום</h3>

            <motion.div
              animate={reduce ? undefined : { scale: [1, 1.02, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="group w-full bg-white border-2 border-primary p-5 rounded-2xl flex items-center justify-between shadow-sm shadow-primary/10"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-slate-800">כרטיס אשראי</div>
                  <div className="text-xs text-slate-500">תשלום מאובטח</div>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-primary" />
            </motion.div>

            <div className="group w-full bg-white border-2 border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400">
                  <Wallet className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-slate-800">יתרת חשבון</div>
                  <div className="text-xs text-slate-500">יתרה זמינה: ₪5,200</div>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-slate-300" />
            </div>

            <p className="text-center text-sm text-slate-400 leading-relaxed px-4">
              שימו לב - אישור תשלום באשראי לוקח עד יומיים. המתנות ישלחו מיד לאחר האישור
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-center gap-4 mt-8 w-full">
          <button className="w-48 py-3.5 px-8 border border-primary text-primary font-bold rounded-xl">חזרה</button>
          <button className="w-48 py-3.5 px-8 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20">אישור ותשלום</button>
        </div>
      </div>
    </WizardShell>
  );
};

export default SummaryStep;
