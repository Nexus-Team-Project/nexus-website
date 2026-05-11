import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api } from '../lib/api';
import DashboardMock from '../components/workspace/DashboardMock';
import OnboardingWizard from '../components/workspace/OnboardingWizard';
import SetupAnimation from '../components/workspace/SetupAnimation';
import ScheduleStep from '../components/workspace/ScheduleStep';

type Phase = 'wizard' | 'animation' | 'schedule';

export interface OnboardingData {
  org_name: string;
  website: string;
  business_desc: string;
  primary_use_cases: string[];
  phone: string;
  role: string;
}

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? '';

export default function WorkspaceSetupPage() {
  const [phase, setPhase] = useState<Phase>('wizard');
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const { user } = useAuth();
  const { direction } = useLanguage();
  const navigate = useNavigate();

  const isRtl = direction === 'rtl';
  const homePath = isRtl ? '/he' : '/';

  // If already has org(s), skip setup and go straight to dashboard/org-picker
  useEffect(() => {
    if (!user) return;
    const orgs = user.orgMemberships ?? [];
    if (orgs.length === 1) {
      window.location.replace(`${DASHBOARD_URL}/organizations/${orgs[0].org.slug}`);
    } else if (orgs.length > 1) {
      navigate(isRtl ? '/he/org-select' : '/org-select');
    }
    // 0 orgs → stay on workspace to create one
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWizardComplete = async (data: OnboardingData) => {
    setOnboardingData(data);
    setPhase('animation');
    // Save to backend (fire-and-forget — animation plays while this runs)
    // Capture orgSlug from response for direct redirect to the org page
    api.post<{ success: boolean; orgSlug?: string }>('/api/user/workspace/setup', {
      org_name: data.org_name,
      website: data.website,
      business_desc: data.business_desc,
      primary_use_cases: data.primary_use_cases,
      phone: data.phone,
      role: data.role,
    }).then((res) => {
      if (res.orgSlug) setOrgSlug(res.orgSlug);
    }).catch(console.error);
  };

  const redirectToDashboard = () => {
    const dest = orgSlug
      ? `${DASHBOARD_URL}/organizations/${orgSlug}`
      : DASHBOARD_URL;
    window.location.replace(dest);
  };

  // Very little blur — dashboard clearly visible in background
  const dashFilter =
    phase === 'schedule'
      ? 'blur(0px) brightness(0.72)'
      : 'blur(0.4px) brightness(0.60)';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080C14]">

      {/* ── Dashboard background ─────────────────────────────── */}
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{ filter: dashFilter }}
      >
        <DashboardMock />
      </div>

      {/* ── Modal overlay — 7vh gap top & bottom ─────────────── */}
      <div
        className="absolute inset-0 flex items-center justify-center z-50 px-4 overflow-y-auto"
        style={{ paddingTop: '7vh', paddingBottom: '7vh' }}
      >
        {phase === 'wizard' && (
          <OnboardingWizard
            onComplete={handleWizardComplete}
            onBack={() => navigate(homePath)}
            user={user}
          />
        )}

        {phase === 'animation' && (
          <SetupAnimation onComplete={() => setPhase('schedule')} />
        )}

        {phase === 'schedule' && (
          <ScheduleStep
            user={user}
            onboardingData={onboardingData}
            onBackToSite={redirectToDashboard}
            onExplore={redirectToDashboard}
          />
        )}
      </div>

      {/* ── Shared modal card styles ──────────────────────────── */}
      <style>{`
        .ws-modal {
          background: #ffffff;
          border-radius: 12px;
          width: 100%;
          max-width: min(92vw, 1100px);
          min-height: 600px;
          max-height: 86vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 32px 64px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
          animation: wsIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .ws-content {
          flex: 1;
          overflow-y: auto;
          padding: 2.5rem 3rem;
        }
        .ws-footer {
          border-top: 1px solid #f1f5f9;
          padding: 1rem 2rem;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          flex-shrink: 0;
          position: relative;
          z-index: 10;
        }
        .ws-footer-between {
          border-top: 1px solid #f1f5f9;
          padding: 1rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          position: relative;
          z-index: 10;
        }
        @keyframes wsIn {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
