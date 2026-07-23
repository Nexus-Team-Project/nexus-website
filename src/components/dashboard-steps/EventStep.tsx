// EventStep - static mock of the "choose an occasion" screen (step 1 of the
// send-a-gift wizard). Reproduces the events grid with an "add custom event"
// tile. Micro-animation: a "selected" ring hops from one occasion tile to the
// next (~1.5s each) so it reads as browsing the experience choice. Respects
// prefers-reduced-motion by resting on a single tile. Inline data, no logic.
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import WizardShell from './WizardShell';

interface EventItem {
  id: string;
  name: string;
  imageUrl: string;
}

const EVENTS: EventItem[] = [
  { id: 'holidays', name: 'חגים', imageUrl: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&h=300&fit=crop' },
  { id: 'first-grade', name: "כיתה א'", imageUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=300&fit=crop' },
  { id: 'wedding', name: 'חתונה', imageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=300&fit=crop' },
  { id: 'incentives', name: 'תמריצים', imageUrl: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=300&fit=crop' },
  { id: 'seniority', name: 'ותק', imageUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400&h=300&fit=crop' },
  { id: 'bar-bat-mitzvah', name: 'בני/בנות מצווה', imageUrl: 'https://images.unsplash.com/photo-1464047736614-af63643285bf?w=400&h=300&fit=crop' },
  { id: 'birth-gifts', name: 'מתנות לידה', imageUrl: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400&h=300&fit=crop' },
];

const REST_INDEX = EVENTS.findIndex((e) => e.id === 'wedding');

const EventStep = () => {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(REST_INDEX);

  useEffect(() => {
    if (reduce) {
      setActive(REST_INDEX);
      return;
    }
    const id = setInterval(() => setActive((prev) => (prev + 1) % EVENTS.length), 1500);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <WizardShell title="שליחת מתנה" subtitle="שלב 1 מתוך 5 - בחירת אירוע" activeStep={1}>
      <div className="bg-white rounded-2xl border border-slate-200 p-8">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">ליצירת חוויה אישית</h2>
          <div className="w-12 h-1 bg-primary/20 mx-auto rounded-full" />
        </div>

        <div className="grid grid-cols-4 gap-6">
          {EVENTS.map((event, i) => {
            const selected = active === i;
            return (
              <div key={event.id} className="group cursor-pointer">
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden mb-3 shadow-sm border border-slate-200">
                  <img src={event.imageUrl} alt={event.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

                  {/* Sliding selection ring shared across tiles */}
                  {selected && (
                    <motion.div
                      layoutId="event-ring"
                      className="absolute inset-0 rounded-2xl ring-2 ring-primary shadow-lg shadow-primary/10 pointer-events-none"
                      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    />
                  )}

                  {/* Selection check badge */}
                  <div
                    className={`absolute top-3 left-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      selected ? 'border-primary bg-primary' : 'border-white/80 bg-white/20 backdrop-blur-sm'
                    }`}
                  >
                    {selected && (
                      <motion.span
                        key={active}
                        initial={reduce ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      >
                        <Check className="w-3.5 h-3.5 text-white" />
                      </motion.span>
                    )}
                  </div>
                </div>
                <p className={`text-center font-medium text-sm transition-colors ${selected ? 'font-bold text-primary' : 'text-slate-700'}`}>
                  {event.name}
                </p>
              </div>
            );
          })}

          {/* Create custom event tile */}
          <div className="group cursor-pointer">
            <div className="relative aspect-[4/3] rounded-2xl mb-3 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Plus className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">אירוע מותאם אישית</p>
            </div>
            <p className="text-center font-medium text-sm text-slate-500">צור אירוע חדש</p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between">
        <button className="px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-full">ביטול</button>
        <button className="px-8 py-3 bg-primary text-white font-bold rounded-full shadow-lg shadow-primary/20">
          המשך לשלב הבא
        </button>
      </div>
    </WizardShell>
  );
};

export default EventStep;
