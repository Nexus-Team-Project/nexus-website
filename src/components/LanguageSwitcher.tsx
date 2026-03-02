import { Link, useLocation } from 'react-router-dom';

export default function LanguageSwitcher() {
  const location = useLocation();
  const isHebrew = location.pathname.startsWith('/he');

  return (
    <div className="fixed bottom-6 left-6 z-50">
      <Link
        to={isHebrew ? '/' : '/he'}
        className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 shadow-lg rounded-full px-4 py-2.5 transition-all hover:shadow-xl group"
      >
        <span className="text-lg leading-none">{isHebrew ? '🇺🇸' : '🇮🇱'}</span>
        <span className="text-sm font-medium text-slate-900">
          {isHebrew ? 'English' : 'עברית'}
        </span>
      </Link>
    </div>
  );
}
