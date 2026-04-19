import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bot, Zap, CheckCircle, Pause, XCircle } from 'lucide-react';
import { api } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────

interface AgentSummary {
  id: string;
  slug: string;
  name: string;
  nameHe?: string;
  type: 'SEO' | 'MARKETING' | 'SALES';
  description: string | null;
  descriptionHe?: string | null;
  isActive: boolean;
  color?: string;
  skills: string[];
  integrations: string[];
  _count: { tasks: number; automations: number; logs: number; budgets: number };
}

// ─── Color helpers ────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  SEO: '#10b981',
  MARKETING: '#0d9488',
  SALES: '#f59e0b',
};

function getAgentColor(agent: AgentSummary): string {
  return agent.color || TYPE_COLORS[agent.type] || '#0d9488';
}

// ─── Component ────────────────────────────────────────────

export default function AgentListPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHe = pathname.startsWith('/he/') || pathname === '/he';
  const basePath = isHe ? '/he/admin' : '/admin';

  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.get<AgentSummary[]>('/api/admin/agents')
      .then((data) => {
        if (!cancelled) setAgents(data);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.error ?? 'Failed to load agents');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full border-2 border-gray-200 border-t-nx-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-nx-dark">
            {isHe ? 'סוכנים' : 'Agents'}
          </h1>
          <p className="text-sm text-nx-gray mt-1">
            {isHe
              ? `${agents.length} סוכנים פעילים`
              : `${agents.length} agent${agents.length !== 1 ? 's' : ''} configured`}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Agent grid */}
      {agents.length === 0 && !error ? (
        <div className="text-center py-16">
          <Bot size={48} className="mx-auto text-nx-gray/30 mb-4" />
          <p className="text-nx-gray text-sm">
            {isHe ? 'עדיין אין סוכנים מוגדרים' : 'No agents configured yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {agents.map((agent) => {
            const color = getAgentColor(agent);
            return (
              <div
                key={agent.id}
                onClick={() => navigate(`${basePath}/agents/${agent.slug}`)}
                className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-gray-200 transition-all cursor-pointer overflow-hidden group"
              >
                {/* Colored top border */}
                <div className="h-1" style={{ backgroundColor: color }} />

                <div className="p-5">
                  {/* Agent name + status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-nx-dark group-hover:text-nx-primary transition-colors truncate">
                        {isHe && agent.nameHe ? agent.nameHe : agent.name}
                      </h3>
                      {/* Type badge */}
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1.5"
                        style={{
                          backgroundColor: `${color}15`,
                          color: color,
                        }}
                      >
                        {agent.type}
                      </span>
                    </div>

                    {/* Status indicator */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {agent.isActive ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-medium text-emerald-600">
                            {isHe ? 'פעיל' : 'Active'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          <span className="text-[10px] font-medium text-amber-600">
                            {isHe ? 'מושהה' : 'Paused'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {agent.description && (
                    <p className="text-xs text-nx-gray line-clamp-2 mb-4 leading-relaxed">
                      {isHe && agent.descriptionHe ? agent.descriptionHe : agent.description}
                    </p>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-4 text-xs text-nx-gray mb-3">
                    <div className="flex items-center gap-1">
                      <CheckCircle size={12} className="text-nx-gray/60" />
                      <span>
                        {agent._count.tasks} {isHe ? 'משימות' : 'tasks'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Zap size={12} className="text-nx-gray/60" />
                      <span>
                        {agent._count.automations} {isHe ? 'אוטומציות' : 'automations'}
                      </span>
                    </div>
                  </div>

                  {/* Skills tags */}
                  {agent.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {agent.skills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-100 text-[10px] font-medium text-nx-gray"
                        >
                          {skill}
                        </span>
                      ))}
                      {agent.skills.length > 4 && (
                        <span className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-100 text-[10px] font-medium text-nx-gray">
                          +{agent.skills.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
