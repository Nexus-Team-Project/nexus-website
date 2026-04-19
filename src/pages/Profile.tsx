import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import NexusLogo from '../components/NexusLogo';
import AnimatedGradient from '../components/AnimatedGradient';

// ─── Types ────────────────────────────────────────────────────────

interface OrgMembership {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  org: {
    id: string;
    slug: string;
    name: string;
    nameHe?: string;
    logoUrl?: string;
    primaryColor?: string;
    _count?: { members: number };
  };
}

const ORG_ROLE_LABELS: Record<string, string> = {
  OWNER:  'בעלים',
  ADMIN:  'מנהל',
  MEMBER: 'חבר',
};

const ORG_ROLE_COLORS: Record<string, string> = {
  OWNER:  'bg-purple-100 text-purple-700',
  ADMIN:  'bg-blue-100 text-blue-700',
  MEMBER: 'bg-slate-100 text-slate-600',
};

// ─── Component ────────────────────────────────────────────────────

export default function Profile() {
  const { user, updateUser } = useAuth();

  // Form state
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone]       = useState('');
  const [jobTitle, setJobTitle] = useState('');

  // Org memberships
  const [orgs, setOrgs]           = useState<OrgMembership[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);

  // Save state
  const [isSaving, setIsSaving]   = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]   = useState('');

  // Load full profile (for phone/jobTitle not in AuthUser)
  useEffect(() => {
    api.get<{ phone?: string; jobTitle?: string }>('/api/user/profile')
      .then((p) => {
        setPhone(p.phone ?? '');
        setJobTitle(p.jobTitle ?? '');
      })
      .catch(() => {});
  }, []);

  // Load org memberships
  useEffect(() => {
    api.get<OrgMembership[]>('/api/user/orgs')
      .then((data) => setOrgs(data))
      .catch(() => {})
      .finally(() => setOrgsLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setIsSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      await api.patch('/api/user/profile', {
        fullName: fullName.trim(),
        phone:    phone.trim() || null,
        jobTitle: jobTitle.trim() || null,
      });
      updateUser({ fullName: fullName.trim() });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError((err as Error).message || 'שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  };

  const isHe = true; // Profile is Hebrew-first
  const dashboardPath = user?.role === 'ADMIN' ? '/admin' : '/dashboard';

  return (
    <div className="relative min-h-screen bg-white flex flex-col overflow-hidden">
      {/* Background gradient */}
      <div className="fixed inset-0 z-0">
        <AnimatedGradient clipPath="polygon(30% 0, 60% 0, 80% 100%, 60% 100%)" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col">
        {/* Top bar */}
        <div className="border-b border-gray-100 flex-shrink-0">
          <div className="max-w-6xl mx-auto py-3 px-6 flex items-center justify-between" dir="ltr">
            <Link to={dashboardPath}>
              <NexusLogo height={44} variant="black" page="auth" />
            </Link>
            <Link
              to={dashboardPath}
              className="text-xs text-nx-gray hover:text-nx-dark font-medium flex items-center gap-1"
              dir="rtl"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              חזרה לדאשבורד
            </Link>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex items-start justify-center px-4 pt-8 pb-12 overflow-y-auto">
          <div className="w-full max-w-lg space-y-5" dir="rtl">

            {/* Profile Card */}
            <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6">
              <h1 className="text-xl font-bold text-nx-dark mb-1">הפרופיל שלי</h1>
              <p className="text-xs text-nx-gray mb-5">עדכן את פרטיך האישיים</p>

              {/* Read-only info */}
              <div className="flex items-center gap-3 mb-5 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-10 h-10 rounded-full bg-nx-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-nx-primary font-bold text-sm">
                    {user?.fullName?.charAt(0)?.toUpperCase() ?? '?'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-nx-dark truncate">{user?.fullName}</p>
                  <p className="text-xs text-nx-gray truncate">{user?.email}</p>
                </div>
                <div className="mr-auto flex-shrink-0">
                  {user?.role !== 'USER' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                      {user?.role === 'ADMIN' ? 'אדמין' : 'סוכן'}
                    </span>
                  )}
                </div>
              </div>

              {/* Edit form */}
              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label className="block text-xs text-nx-dark font-medium mb-1">שם מלא</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nx-primary/30 focus:border-nx-primary transition-colors"
                    dir="rtl"
                  />
                </div>

                <div>
                  <label className="block text-xs text-nx-dark font-medium mb-1">טלפון</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="050-0000000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nx-primary/30 focus:border-nx-primary transition-colors"
                    dir="rtl"
                  />
                </div>

                <div>
                  <label className="block text-xs text-nx-dark font-medium mb-1">תפקיד</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="למשל: מנהל שיווק"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nx-primary/30 focus:border-nx-primary transition-colors"
                    dir="rtl"
                  />
                </div>

                {saveError && (
                  <p className="text-xs text-red-500">{saveError}</p>
                )}

                <button
                  type="submit"
                  disabled={isSaving || !fullName.trim()}
                  className={`w-full font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 ${
                    !isSaving && fullName.trim()
                      ? 'bg-nx-primary hover:bg-nx-primary/90 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : saveSuccess ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      נשמר!
                    </>
                  ) : 'שמור שינויים'}
                </button>
              </form>
            </div>

            {/* My Organizations Card */}
            <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6">
              <h2 className="text-base font-bold text-nx-dark mb-1">הארגונים שלי</h2>
              <p className="text-xs text-nx-gray mb-4">הארגונים שאתה חבר בהם ותפקידך בכל אחד</p>

              {orgsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : orgs.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-sm text-nx-gray mb-3">אינך חבר באף ארגון</p>
                  <p className="text-xs text-gray-400">השתמש בקישור הזמנה כדי להצטרף לארגון</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orgs.map((m) => (
                    <div
                      key={m.org.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      {/* Org avatar */}
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ backgroundColor: m.org.primaryColor ?? '#6366f1' }}
                      >
                        {m.org.logoUrl ? (
                          <img src={m.org.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          m.org.name.charAt(0).toUpperCase()
                        )}
                      </div>

                      {/* Org info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-nx-dark truncate">{m.org.name}</p>
                        {m.org._count && (
                          <p className="text-xs text-nx-gray">{m.org._count.members} חברים</p>
                        )}
                      </div>

                      {/* Role badge — OrgRole, NOT UserRole */}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${ORG_ROLE_COLORS[m.role] ?? 'bg-slate-100 text-slate-600'}`}>
                        {ORG_ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-20 py-3 px-8" dir="ltr">
        <div className="max-w-6xl mx-auto">
          <span className="text-xs text-nx-dark font-medium">© 2025 Nexus</span>
        </div>
      </div>
    </div>
  );
}
