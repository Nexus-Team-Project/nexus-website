import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import BorderHighlightCard from './BorderHighlightCard';

export interface Partner {
  id: string;
  title: string;
  thumbnailUrl: string;
  categories: string[];
  discount?: string | null;
  /** Cashback percentage (login-gated server-side; absent for guests). */
  cashbackPct?: number | null;
  description?: string | null;
  websiteUrl?: string | null;
  /** Bilingual search aliases (HE/EN alt names) - used by the partners page search filter. */
  searchTerms?: string[];
}

interface PartnerCardProps {
  partner: Partner;
  isLoggedIn: boolean;
}

export default function PartnerCard({ partner, isLoggedIn }: PartnerCardProps) {
  const { language } = useLanguage();
  const loginTo = language === 'he' ? '/he/login' : '/login';
  const lockLabel = language === 'he' ? 'התחבר לצפייה בקאשבק' : 'Sign in to view cashback';

  return (
    <BorderHighlightCard className="group bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-violet-200 transition-all duration-200 overflow-hidden flex flex-col">
      {/* Logo */}
      <div className="flex items-center justify-center h-48 bg-white p-4">
        <img
          src={partner.thumbnailUrl}
          alt={partner.title}
          className="max-h-40 max-w-[90%] object-contain"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = '0';
          }}
        />
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Title */}
        <h3 className="font-semibold text-slate-900 text-sm leading-tight">{partner.title}</h3>

        {/* Category chips */}
        {partner.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {partner.categories.slice(0, 3).map((cat) => (
              <span
                key={cat}
                className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-100"
              >
                {cat}
              </span>
            ))}
          </div>
        )}

        {/* Discount area — pinned to bottom */}
        <div className="mt-auto pt-3 border-t border-slate-50">
          {isLoggedIn ? (
            <div className="flex flex-col gap-1.5">
              {typeof partner.cashbackPct === 'number' && (
                /* Logged in + cashback value */
                <div className="flex items-center justify-center gap-1.5 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                  <span className="text-violet-700 font-bold text-sm">
                    {language === 'he'
                      ? `${partner.cashbackPct}% קאשבק`
                      : `${partner.cashbackPct}% cashback`}
                  </span>
                </div>
              )}
              {partner.discount ? (
                /* Logged in + has discount */
                <div className="flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <span className="text-emerald-600 font-bold text-sm">{partner.discount}</span>
                </div>
              ) : typeof partner.cashbackPct !== 'number' ? (
                /* Logged in + nothing configured */
                <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-slate-400 text-xs">
                    {language === 'he' ? 'ממתין להטבה' : 'Benefit coming soon'}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            /* Guest — blurred lock */
            <div className="relative overflow-hidden rounded-xl">
              <div className="flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 select-none">
                <span className="text-slate-400 font-bold text-sm blur-[3px]">00% הנחה</span>
              </div>
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-xl backdrop-blur-[0.5px] bg-white/60">
                <Lock size={11} className="text-nx-primary shrink-0" />
                <Link
                  to={loginTo}
                  className="text-[11px] font-semibold text-nx-primary hover:underline whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  {lockLabel}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </BorderHighlightCard>
  );
}
