// BrandsStep - static mock of the "choose gift value + brands" screen (step 2,
// labelled מתנה). Reproduces the amount selector card, the category sidebar and
// the brands grid. Micro-animation: the gift amount sweeps across its range
// (value counts + slider fill/thumb move) while a highlight ring hops across
// the brand tiles in sequence. Respects prefers-reduced-motion (rests calm).
import { useEffect, useState } from 'react';
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Search } from 'lucide-react';
import WizardShell from './WizardShell';

interface Brand {
  id: string;
  name: string;
  category: string;
  imageUrl?: string;
  backgroundColor?: string;
  minPrice: number;
}

const BRANDS: Brand[] = [
  { id: '1', name: 'ArmyZone', category: 'ספורט וטיולים', imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&h=250&fit=crop', minPrice: 10 },
  { id: '2', name: 'JoyZone', category: 'בידור ופנאי', imageUrl: 'https://images.unsplash.com/photo-1528543606781-2f6e6857f318?w=400&h=250&fit=crop', minPrice: 10 },
  { id: '3', name: 'MAC Cosmetics', category: 'יופי וקוסמטיקה', imageUrl: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=250&fit=crop', minPrice: 10 },
  { id: '4', name: "L'OCCITANE", category: 'טיפוח וספא', backgroundColor: 'bg-amber-400', minPrice: 10 },
  { id: '5', name: 'Opticana', category: 'משקפיים ואופטיקה', backgroundColor: 'bg-lime-400', minPrice: 10 },
  { id: '6', name: 'Kravitz', category: 'כלי כתיבה ומשרד', backgroundColor: 'bg-orange-500', minPrice: 10 },
];

const CATEGORIES = [
  { id: 'all', label: 'כל הקטגוריות' },
  { id: 'food', label: 'אוכל ומסעדות' },
  { id: 'fashion', label: 'אופנה וסטייל' },
  { id: 'attractions', label: 'אטרקציות' },
  { id: 'home', label: 'בית ועיצוב' },
  { id: 'spa', label: 'בריאות וספא' },
  { id: 'experiences', label: 'חוויות' },
];

const BrandsStep = () => {
  const reduce = useReducedMotion();

  // Animated gift amount: sweeps between values, driving the number + slider.
  const amount = useMotionValue(250);
  const amountText = useTransform(amount, (v) => Math.round(v).toLocaleString());
  const fillWidth = useTransform(amount, [10, 10000], ['0%', '100%']);

  // Highlight ring cycles across the brand tiles.
  const [activeBrand, setActiveBrand] = useState(1);

  useEffect(() => {
    if (reduce) {
      amount.set(250);
      return;
    }
    const controls = animate(amount, [250, 1800, 600, 3400, 250], {
      duration: 9,
      ease: 'easeInOut',
      times: [0, 0.28, 0.5, 0.78, 1],
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [reduce, amount]);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setActiveBrand((prev) => (prev + 1) % BRANDS.length), 1400);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <WizardShell title="בחירת מתנות" subtitle="שלב 2 מתוך 5 - בחירת ערך ומותגים" activeStep={2}>
      {/* Gift Amount Selection */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-center mb-1">פרטי המתנה</h2>
          <p className="text-slate-500 text-center text-sm mb-5">בחר ערך מתנה וסוג החוויה</p>

          <div className="flex items-center justify-center gap-4 mb-5">
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₪</span>
              <div className="w-48 pr-10 pl-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xl font-semibold text-center tabular-nums">
                <motion.span>{amountText}</motion.span>
              </div>
            </div>
            <label className="text-slate-600 font-medium">בחר סכום</label>
          </div>

          <div className="px-4 mb-6">
            <div className="w-full h-2 bg-slate-200 rounded-lg relative">
              <motion.div className="absolute inset-y-0 right-0 bg-primary rounded-lg" style={{ width: fillWidth }} />
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-primary rounded-full shadow"
                style={{ right: fillWidth }}
              />
            </div>
            <div className="flex justify-between mt-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <span>₪10</span>
              <span>₪10,000</span>
            </div>
          </div>

          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button className="flex-1 py-2.5 px-6 rounded-lg font-semibold bg-primary text-white shadow-md">אוספים</button>
            <button className="flex-1 py-2.5 px-6 rounded-lg font-semibold text-slate-500">בחירה ידנית</button>
          </div>
        </div>
      </div>

      {/* Content: sidebar + brands grid */}
      <div className="flex gap-6">
        <aside className="w-64 flex-shrink-0">
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-5 border-b border-slate-100 pb-2">
              קטגוריה
            </h3>
            <div className="space-y-4">
              {CATEGORIES.map((category) => (
                <label key={category.id} className="flex items-center cursor-pointer">
                  <input type="checkbox" readOnly checked={category.id === 'all'} className="w-5 h-5 rounded text-primary border-slate-300" />
                  <span className="mr-3 text-sm font-medium text-slate-600">{category.label}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex p-1 bg-slate-200 rounded-xl">
              <button className="px-6 py-2 rounded-lg text-sm font-bold bg-white shadow-sm text-slate-900">מותגים מקומיים</button>
              <button className="px-6 py-2 rounded-lg text-sm font-bold text-slate-500">בינלאומי</button>
            </div>
            <div className="relative max-w-sm w-full">
              <Search className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <div className="w-full pr-10 pl-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-400 text-sm">
                חיפוש מותגים...
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {BRANDS.map((brand, i) => {
              const highlighted = activeBrand === i;
              return (
                <div key={brand.id} className="group relative bg-white rounded-2xl border border-slate-100 overflow-hidden cursor-pointer">
                  {highlighted && (
                    <motion.div
                      layoutId="brand-ring"
                      className="absolute inset-0 z-10 rounded-2xl ring-2 ring-primary shadow-xl shadow-primary/10 pointer-events-none"
                      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    />
                  )}
                  <div className={`aspect-[16/10] flex items-center justify-center p-8 overflow-hidden ${brand.backgroundColor || 'bg-slate-100'}`}>
                    {brand.imageUrl ? (
                      <img src={brand.imageUrl} alt={brand.name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <span className={`text-2xl font-bold ${brand.backgroundColor?.includes('amber') || brand.backgroundColor?.includes('lime') ? 'text-slate-900' : 'text-white'}`}>
                        {brand.name}
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-slate-900">{brand.name}</h4>
                      <p className="text-xs text-slate-500">{brand.category}</p>
                    </div>
                    <span className="text-lg font-bold text-primary">₪{brand.minPrice}+</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button className="px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-full">חזור</button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="font-bold text-slate-700">3 מותגים נבחרו</span>
          </div>
          <button className="px-10 py-3 bg-primary text-white font-bold rounded-full shadow-lg shadow-primary/20">המשך לשלב הבא</button>
        </div>
      </div>
    </WizardShell>
  );
};

export default BrandsStep;
