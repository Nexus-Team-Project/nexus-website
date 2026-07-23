// RecipientsStep - static mock of the recipients screen (step 4, נמענים).
// Reproduces the action bar (add / preview / send-timing / totals), the options
// row and the recipients table. Micro-animation: the recipient rows populate one
// by one (staggered fade/slide in) and the header count + total value tick up
// accordingly, then the list resets and loops. Respects prefers-reduced-motion.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Clock, Calendar, Trash2 } from 'lucide-react';
import WizardShell from './WizardShell';

interface Recipient {
  id: string;
  name: string;
  email: string;
  giftAmount: number;
  greeting: string;
}

const RECIPIENTS: Recipient[] = [
  { id: '1', name: 'יוסי כהן', email: 'yossi@example.com', giftAmount: 250, greeting: 'מזל טוב!' },
  { id: '2', name: 'שרה לוי', email: 'sara@example.com', giftAmount: 250, greeting: '-' },
  { id: '3', name: 'דוד מזרחי', email: 'david@example.com', giftAmount: 500, greeting: 'תודה על הכל' },
  { id: '4', name: 'רחל אברהם', email: 'rachel@example.com', giftAmount: 250, greeting: '-' },
  { id: '5', name: 'משה ישראלי', email: 'moshe@example.com', giftAmount: 300, greeting: 'בהצלחה' },
];

const GRID = 'grid grid-cols-[60px_minmax(180px,1fr)_minmax(200px,1fr)_140px_minmax(150px,1fr)_100px]';

const RecipientsStep = () => {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(RECIPIENTS.length);

  useEffect(() => {
    if (reduce) {
      setCount(RECIPIENTS.length);
      return;
    }
    setCount(0);
    const id = setInterval(() => {
      setCount((prev) => (prev >= RECIPIENTS.length ? 0 : prev + 1));
    }, 850);
    return () => clearInterval(id);
  }, [reduce]);

  const visible = RECIPIENTS.slice(0, count);
  const totalValue = visible.reduce((sum, r) => sum + r.giftAmount, 0);

  return (
    <WizardShell title="למי לשלוח את המתנה ומתי?" subtitle="שלב 4 מתוך 5 - הוספת נמענים" activeStep={4}>
      {/* Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button className="bg-primary text-white px-6 py-2.5 rounded-full font-bold flex items-center gap-2 shadow-lg shadow-primary/20">
              הוספת נמענים
              <ChevronDown className="w-5 h-5" />
            </button>
            <button className="border border-primary text-primary px-6 py-2.5 rounded-full font-bold">תצוגה מקדימה</button>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <label className="text-xs text-slate-400 mb-1">תזמון שליחה</label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="bg-slate-50 rounded-lg pr-10 pl-4 py-2 text-sm min-w-[140px]">שליחה כעת</div>
                  <Clock className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                <div className="relative">
                  <div className="bg-slate-50 rounded-lg pr-10 pl-4 py-2 text-sm w-40 text-slate-400">תוקף המתנה</div>
                  <Calendar className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>
            <div className="border-r border-slate-200 h-10 mx-2" />
            <div className="text-left">
              <div className="text-xs text-slate-400 tabular-nums">סה״כ שווי {totalValue.toLocaleString()} ₪</div>
              <div className="font-bold text-lg tabular-nums">{count} נמענים</div>
            </div>
          </div>
        </div>
      </div>

      {/* Options Row */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" readOnly className="w-4 h-4 rounded text-primary border-slate-300" />
            <span className="text-sm text-slate-600">סכומים שונים</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" readOnly className="w-4 h-4 rounded text-primary border-slate-300" />
            <span className="text-sm text-slate-600">נעילת אתר בחירה בקוד</span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">סכום המתנה</span>
          <div className="w-24 text-center bg-slate-50 border border-slate-200 rounded-lg py-1 text-sm">250</div>
          <span className="text-sm text-slate-500">₪</span>
        </div>
      </div>

      {/* Recipients Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className={`${GRID} bg-slate-50/60 px-6 py-4 text-sm font-semibold text-slate-500 border-b border-slate-200 items-center`}>
          <div className="flex items-center justify-center">
            <input type="checkbox" readOnly className="w-4 h-4 rounded text-primary border-slate-300" />
          </div>
          <div>שם</div>
          <div className="text-center">אימייל</div>
          <div className="text-center">סכום המתנה</div>
          <div className="text-center">ברכה אישית</div>
          <div className="text-center">פעולות</div>
        </div>

        {/* Fixed-height body so the frame does not jump as rows populate */}
        <div style={{ minHeight: 5 * 57 }}>
          <AnimatePresence initial={false}>
            {visible.map((r) => (
              <motion.div
                key={r.id}
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={`${GRID} px-6 py-4 border-b border-slate-100 items-center`}
              >
                <div className="flex items-center justify-center">
                  <input type="checkbox" readOnly className="w-4 h-4 rounded text-primary border-slate-300" />
                </div>
                <div className="truncate">{r.name}</div>
                <div className="text-center text-slate-600 truncate">{r.email}</div>
                <div className="text-center whitespace-nowrap tabular-nums">{r.giftAmount} ₪</div>
                <div className="text-center text-sm text-slate-500 truncate">{r.greeting}</div>
                <div className="flex items-center justify-center">
                  <div className="p-1.5 rounded-lg">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200">
        <button className="px-12 py-3 border border-primary text-primary font-bold rounded-xl">חזרה</button>
        <button className="px-12 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20">הבא</button>
      </div>
    </WizardShell>
  );
};

export default RecipientsStep;
