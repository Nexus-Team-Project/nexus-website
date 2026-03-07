import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────

interface InviteInfo {
  id: string;
  token: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  label?: string;
  expiresAt?: string;
  maxUses?: number;
  useCount: number;
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

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'בעלים',
  ADMIN: 'מנהל',
  MEMBER: 'חבר',
};

// ─── Component ────────────────────────────────────────────────────

export default function JoinOrg() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'success' | 'already'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('error'); setErrorMsg('קישור לא תקין'); return; }
    api.get(`/api/invites/${token}`)
      .then((data) => { setInvite(data as InviteInfo); setStatus('ready'); })
      .catch((err: Error) => { setStatus('error'); setErrorMsg(err.message); });
  }, [token]);

  const handleJoin = async () => {
    if (!user) {
      // Redirect to login, come back after
      navigate(`/login?next=/join/${token}`);
      return;
    }
    setJoining(true);
    try {
      const result = await api.post(`/api/invites/${token}/accept`, {}) as { alreadyMember: boolean; org: InviteInfo['org'] };
      if (result.alreadyMember) {
        setStatus('already');
      } else {
        setStatus('success');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    } finally {
      setJoining(false);
    }
  };

  // ─── Shared layout wrapper ───────────────────────────────────────
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div
      className="min-h-dvh flex items-center justify-center bg-slate-50 px-4"
      style={{ fontFamily: 'system-ui, sans-serif', direction: 'rtl' }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center">
        {children}
      </div>
    </div>
  );

  // ─── Loading ──────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <Wrapper>
        <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin mx-auto mb-4" />
        <p className="text-slate-500 text-sm">טוען...</p>
      </Wrapper>
    );
  }

  // ─── Error ───────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <Wrapper>
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🔗</span>
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">קישור לא תקין</h1>
        <p className="text-sm text-slate-500 mb-6">{errorMsg || 'קישור ההזמנה פג תוקף או שאינו קיים.'}</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          חזרה לדף הבית
        </button>
      </Wrapper>
    );
  }

  // ─── Already a member ─────────────────────────────────────────
  if (status === 'already') {
    return (
      <Wrapper>
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✅</span>
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">אתה כבר חבר</h1>
        <p className="text-sm text-slate-500 mb-6">
          אתה כבר חבר ב-<span className="font-medium text-slate-800">{invite?.org.name}</span>.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          עבור לדאשבורד
        </button>
      </Wrapper>
    );
  }

  // ─── Success ─────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <Wrapper>
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm"
          style={{ backgroundColor: invite?.org.primaryColor ?? '#0066cc' }}
        >
          {invite?.org.logoUrl ? (
            <img src={invite.org.logoUrl} alt="" className="w-16 h-16 rounded-2xl object-cover" />
          ) : (
            <span className="text-white text-2xl font-bold">{invite?.org.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">ברוך הבא! 🎉</h1>
        <p className="text-sm text-slate-500 mb-6">
          הצטרפת בהצלחה ל-<span className="font-medium text-slate-800">{invite?.org.name}</span>
          {' '}כ<span className="font-medium text-slate-700">{ROLE_LABELS[invite?.role ?? 'MEMBER']}</span>.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          עבור לדאשבורד
        </button>
      </Wrapper>
    );
  }

  // ─── Ready — show invite info ─────────────────────────────────
  const org = invite!.org;
  return (
    <Wrapper>
      {/* Org logo */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm"
        style={{ backgroundColor: org.primaryColor ?? '#0066cc' }}
      >
        {org.logoUrl ? (
          <img src={org.logoUrl} alt="" className="w-16 h-16 rounded-2xl object-cover" />
        ) : (
          <span className="text-white text-2xl font-bold">{org.name.charAt(0).toUpperCase()}</span>
        )}
      </div>

      <p className="text-xs text-slate-400 mb-1">הוזמנת להצטרף ל</p>
      <h1 className="text-xl font-bold text-slate-900 mb-0.5">{org.name}</h1>
      {org.nameHe && org.nameHe !== org.name && (
        <p className="text-sm text-slate-400 mb-3">{org.nameHe}</p>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-center gap-4 text-xs text-slate-500 mt-3 mb-5">
        {org._count && (
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {org._count.members} חברים
          </span>
        )}
        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
          תפקיד: {ROLE_LABELS[invite!.role]}
        </span>
        {invite!.label && (
          <span className="text-slate-400">{invite!.label}</span>
        )}
      </div>

      {/* CTA */}
      {!user ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">יש להתחבר כדי להצטרף לארגון</p>
          <button
            onClick={() => navigate(`/login?next=/join/${token}`)}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            התחברות / הרשמה
          </button>
        </div>
      ) : (
        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {joining && (
            <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          )}
          הצטרף ל{org.name}
        </button>
      )}

      {/* Expiry info */}
      {invite!.expiresAt && (
        <p className="text-[11px] text-slate-400 mt-4">
          הקישור בתוקף עד {new Date(invite!.expiresAt).toLocaleDateString('he-IL')}
        </p>
      )}
    </Wrapper>
  );
}
