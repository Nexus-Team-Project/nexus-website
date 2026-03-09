import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export default function DashboardEnvelopePreview() {
  const { language, direction } = useLanguage();
  const he = language === 'he';
  const isRtl = direction === 'rtl';
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative w-full flex items-center justify-center" style={{ minHeight: 520 }}>
      <div className="relative w-full max-w-sm mx-auto px-4">
        {/* Dashboard */}
        <div
          className="transition-all duration-700 ease-out"
          style={{
            opacity: animated ? 1 : 0,
            transform: animated ? 'translateY(0) scale(1)' : 'translateY(-20px) scale(0.95)',
            transitionDelay: '0.3s',
          }}
        >
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            {/* Browser chrome */}
            <div className="h-8 bg-slate-50 border-b border-slate-100 flex items-center px-3 gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-300" />
              <div className="w-2 h-2 rounded-full bg-yellow-300" />
              <div className="w-2 h-2 rounded-full bg-green-300" />
              <span className={`${isRtl ? 'mr-3' : 'ml-3'} text-[9px] text-slate-400 font-mono`}>nexus.co.il/dashboard</span>
              <div className={`${isRtl ? 'mr-auto' : 'ml-auto'} flex items-center gap-1`}>
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[9px] text-green-600 font-medium">{he ? 'מחובר' : 'Live'}</span>
              </div>
            </div>

            <div className="p-4" dir={direction}>
              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="text-[10px] text-slate-400 mb-0.5">{he ? 'סה״כ הטבות פעילות' : 'Total Active Benefits'}</div>
                  <div className="text-lg font-bold text-slate-900">{he ? '₪ 2,450,000' : '$2,450,000'}</div>
                </div>
                <div className="h-8 w-8 bg-stripe-purple/10 rounded-full flex items-center justify-center">
                  <BarChart3 size={16} className="text-stripe-purple" />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                  <div className="text-sm font-bold text-emerald-700">{he ? '₪1.8M' : '$1.8M'}</div>
                  <div className="text-[8px] text-emerald-600">{he ? 'נוצל' : 'Redeemed'}</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <div className="text-sm font-bold text-blue-700">{he ? '₪650K' : '$650K'}</div>
                  <div className="text-[8px] text-blue-600">{he ? 'זמין' : 'Available'}</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-2 text-center">
                  <div className="text-sm font-bold text-purple-700">1,240</div>
                  <div className="text-[8px] text-purple-600">{he ? 'חברים' : 'Members'}</div>
                </div>
              </div>

              {/* Progress bars */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{he ? 'קאשבק' : 'Cashback'}</span>
                  <span className="text-slate-700 font-semibold">78%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-stripe-purple to-purple-400 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: animated ? '78%' : '0%' }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{he ? 'גיפט קארדס' : 'Gift Cards'}</span>
                  <span className="text-slate-700 font-semibold">92%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-emerald-500 to-emerald-300 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: animated ? '92%' : '0%', transitionDelay: '0.3s' }}
                  />
                </div>
              </div>

              {/* Notification */}
              <div className="mt-3 bg-green-50 rounded-lg p-2 border border-green-100 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle size={12} className="text-green-600" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-900">{he ? 'הקמפיין הושלם!' : 'Campaign Complete!'}</div>
                  <div className="text-[8px] text-slate-500">{he ? '350 חברים קיבלו הטבה חדשה' : '350 members received a new benefit'}</div>
                </div>
              </div>

              {/* Extra rows that will be hidden by envelope */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{he ? 'ארוחות' : 'Meals'}</span>
                  <span className="text-slate-700 font-semibold">64%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-amber-500 to-amber-300 rounded-full" style={{ width: '64%' }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{he ? 'חינוך' : 'Education'}</span>
                  <span className="text-slate-700 font-semibold">45%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-blue-500 to-blue-300 rounded-full" style={{ width: '45%' }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{he ? 'בריאות' : 'Health'}</span>
                  <span className="text-slate-700 font-semibold">87%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-rose-500 to-rose-300 rounded-full" style={{ width: '87%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
