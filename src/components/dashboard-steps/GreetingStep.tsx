// GreetingStep - static mock of the greeting-card editor (step 3, ברכה).
// Reproduces the email/SMS toggle, the sender + subject fields, the classic
// card layout (logo band, hero image, greeting, message, Nexus footer) and the
// layout-style sidebar. Micro-animation: the greeting message types itself in
// (typewriter with a blinking caret) then resets and loops, and the greeting
// heading + @firstName chip pop in each cycle. Respects prefers-reduced-motion.
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Building2, Plus, Pencil, Image as ImageIcon } from 'lucide-react';
import WizardShell from './WizardShell';

const NEXUS_LOGO = '/dashboard-steps/nexus-logo.png';
const CARD_IMAGE = 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&h=600&fit=crop';

const GREETING_TEXT = 'שלום @firstName,';
const MESSAGE_TEXT =
  'רציתי לנצל את ההזדמנות להודות לך על כל העבודה הקשה והמסירות שלך. היית חלק כל כך מדהים בצוות, ואנחנו באמת מעריכים את כל מה שאת עושה! תיהני מהמתנה הקטנה הזו כאות התודה שלנו. ✨';

// Render text so @dynamicFields render as highlighted chips.
const renderWithFields = (text: string) =>
  text.split(/(@\w+)/).map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="bg-primary/20 text-primary px-2 py-0.5 rounded font-semibold">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );

const GreetingStep = () => {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState('');
  const done = typed.length >= MESSAGE_TEXT.length;

  useEffect(() => {
    if (reduce) {
      setTyped(MESSAGE_TEXT);
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (i < MESSAGE_TEXT.length) {
        i += 1;
        setTyped(MESSAGE_TEXT.slice(0, i));
        timer = setTimeout(step, 26);
      } else {
        // Hold the finished message, then reset and loop.
        timer = setTimeout(() => {
          i = 0;
          setTyped('');
          timer = setTimeout(step, 500);
        }, 2400);
      }
    };
    timer = setTimeout(step, 500);
    return () => clearTimeout(timer);
  }, [reduce]);

  return (
    <WizardShell title="הוסף נגיעה אישית" subtitle="שלב 3 מתוך 5 - עריכת ברכות לאימייל ו-SMS" activeStep={3}>
      {/* Message Type Toggle */}
      <div className="flex justify-center">
        <div className="bg-white p-1 rounded-full border border-slate-200 flex shadow-sm">
          <button className="px-8 py-2.5 rounded-full font-medium text-sm bg-primary text-white shadow-md">אימייל</button>
          <button className="px-8 py-2.5 rounded-full font-medium text-sm text-slate-500">הודעת טקסט</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* Card Editor */}
        <div className="col-span-9 bg-white rounded-3xl p-6 shadow-xl border border-slate-100">
          <div className="space-y-5">
            {/* Sender Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mr-1">שם השולח</label>
              <div className="w-full bg-slate-50 rounded-2xl py-3.5 px-5 text-slate-800">Nexus Team</div>
            </div>

            {/* Subject Line */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mr-1">שורת נושא</label>
              <div className="relative">
                <div className="w-full bg-slate-50 rounded-2xl py-3.5 px-5 pl-12 text-slate-800">הפתעה מיוחדת מחכה לך! 🎁</div>
                <Pencil className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            {/* Card Preview */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">עיצוב כרטיס והודעה</label>
                <button className="px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-semibold flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  שדות דינמיים
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Logo band */}
                <div className="bg-slate-50 border-b border-slate-200 py-5 px-10 flex flex-col items-center gap-2">
                  <div className="flex items-center justify-center w-16 h-16 bg-slate-200 rounded-xl border-2 border-dashed border-slate-300">
                    <Building2 className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-xs text-slate-500">לא נמצא לוגו חברה</p>
                </div>

                {/* Hero image */}
                <div className="relative group">
                  <img src={CARD_IMAGE} alt="Greeting card" className="w-full h-48 object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <div className="bg-white/90 px-6 py-2.5 rounded-full flex items-center gap-2 text-slate-900 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      <ImageIcon className="w-5 h-5" />
                      <span>שנה תמונה</span>
                    </div>
                  </div>
                </div>

                {/* Greeting + typed message */}
                <div className="p-6 pt-8 text-center">
                  <motion.h2
                    key={done ? 'done' : 'typing'}
                    initial={reduce ? false : { scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    className="text-2xl font-bold text-slate-800 inline-block"
                  >
                    {renderWithFields(GREETING_TEXT)}
                  </motion.h2>
                </div>
                <div className="px-10 pb-6 text-center min-h-[96px]">
                  <p className="text-base text-slate-600 leading-relaxed">
                    {renderWithFields(typed)}
                    {!reduce && !done && (
                      <motion.span
                        aria-hidden
                        className="inline-block w-[2px] h-[1.1em] align-middle bg-primary mr-0.5"
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                      />
                    )}
                  </p>
                </div>

                {/* Footer logo */}
                <div className="px-10 pb-8">
                  <div className="pt-6 border-t border-slate-100 flex justify-center">
                    <img src={NEXUS_LOGO} alt="Nexus" className="h-9 w-auto opacity-40" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Layout Styles Sidebar */}
        <div className="col-span-3 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">סגנון פריסה</h3>
          <div className="grid grid-cols-2 gap-3">
            {['classic', 'minimal', 'overlay', 'custom'].map((layout) => {
              const active = layout === 'classic';
              return (
                <div key={layout} className={`relative bg-white p-2 rounded-xl border-2 ${active ? 'border-primary shadow-lg' : 'border-transparent'}`}>
                  <div className={`aspect-[3/4] bg-slate-100 rounded-lg flex flex-col p-2 overflow-hidden ${active ? '' : 'opacity-60'}`}>
                    <div className="w-full h-1/2 bg-slate-200 rounded-sm mb-2" />
                    <div className="w-3/4 h-1 bg-slate-200 rounded-full mb-1" />
                    <div className="w-full h-1 bg-slate-200 rounded-full mb-1" />
                    <div className="w-1/2 h-1 bg-slate-200 rounded-full" />
                  </div>
                  {active && (
                    <div className="absolute -top-1 -left-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-md">
                      <Plus className="w-3 h-3 text-white rotate-45" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button className="px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-full">חזור לבחירה</button>
        <button className="px-10 py-3.5 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20">המשך לתצוגה מקדימה</button>
      </div>
    </WizardShell>
  );
};

export default GreetingStep;
