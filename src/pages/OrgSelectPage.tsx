import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import NexusLogo from '../components/NexusLogo';

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? '';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  OWNER:  { label: 'Owner',  color: '#0D9488' },
  ADMIN:  { label: 'Admin',  color: '#0ea5e9' },
  MEMBER: { label: 'Member', color: '#10b981' },
};

export default function OrgSelectPage() {
  const { user, isLoading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isHe = language === 'he';

  const orgs = user?.orgMemberships ?? [];

  useEffect(() => {
    if (isLoading) return;
    if (!user) { navigate(isHe ? '/he/login' : '/login', { replace: true }); return; }
    if (orgs.length === 0) { navigate(isHe ? '/he/workspace' : '/workspace', { replace: true }); return; }
    // If only one org — skip picker and go straight in
    if (orgs.length === 1) {
      window.location.replace(`${DASHBOARD_URL}/organizations/${orgs[0].org.slug}`);
    }
  }, [isLoading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // While loading or about to redirect
  if (isLoading || !user || orgs.length <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#080C14' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #222', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const handleEnter = (slug: string) => {
    window.location.replace(`${DASHBOARD_URL}/organizations/${slug}`);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#080C14' }}
      dir={isHe ? 'rtl' : 'ltr'}
    >
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-white/10 px-8 py-4" dir="ltr">
        <Link to={isHe ? '/he' : '/'}>
          <NexusLogo height={40} variant="white" page="auth" />
        </Link>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">
            {isHe ? 'בחר ארגון' : 'Select an Organization'}
          </h1>
          <p className="text-white/50 text-sm">
            {isHe ? 'לאיזה ארגון תרצה להיכנס?' : 'Which organization would you like to enter?'}
          </p>
        </div>

        {/* Org cards grid */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {orgs.map(({ role, org }) => {
            const badge = ROLE_LABELS[role] ?? { label: role, color: '#6b7280' };
            const initials = org.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? '')
              .join('');

            return (
              <div
                key={org.id}
                className="group relative flex flex-col rounded-2xl overflow-hidden border border-white/10 transition-all duration-200 hover:border-white/25 hover:shadow-2xl"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                {/* Colored top accent bar */}
                <div
                  className="h-1 w-full flex-shrink-0"
                  style={{ background: org.primaryColor ?? badge.color }}
                />

                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Logo / Initials */}
                  <div className="flex items-center gap-3">
                    {org.logoUrl ? (
                      <img
                        src={org.logoUrl}
                        alt={org.name}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ background: org.primaryColor ?? badge.color }}
                      >
                        {initials || '?'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm truncate leading-tight">{org.name}</p>
                      {/* Role badge */}
                      <span
                        className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: `${badge.color}22`, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Enter button */}
                  <button
                    onClick={() => handleEnter(org.slug)}
                    className="w-full py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
                    style={{
                      background: org.primaryColor ?? badge.color,
                      color: '#fff',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity = '0.85';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                    }}
                  >
                    {isHe ? 'כנס' : 'Enter'}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: isHe ? 'scaleX(-1)' : undefined }}>
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sign out hint */}
        <p className="mt-10 text-white/30 text-xs">
          {isHe ? 'מחובר כ-' : 'Signed in as '}<span className="text-white/50">{user.email}</span>
        </p>
      </div>
    </div>
  );
}
