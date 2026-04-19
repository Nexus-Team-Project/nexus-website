import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import {
  Users, MessageSquare, TrendingUp, Percent,
  Star, Brain, CreditCard, RefreshCw, Bell,
  CheckCircle, XCircle, Clock, AlertTriangle, Zap, BookOpen,
} from 'lucide-react';
import { useAnalytics } from '../hooks/useAnalytics';
import { PRODUCT } from '../lib/analyticsEvents';

// ─── Types ────────────────────────────────────────────────

interface Metric {
  value: number;
  change: number | null;
  unit?: string;
}

interface MetricsData {
  period: string;
  visitors: Metric;
  chats: Metric;
  leads: Metric;
  signups: Metric;
  conversion: Metric;
}

interface ChartPoint {
  date: string;
  visitors: number;
  chats: number;
  leads: number;
  signups: number;
}

interface Visitor {
  visitorId: string;
  ip: string | null;
  city: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  firstSeen: string;
  lastSeen: string;
  pageViews: number;
  lastPage: string | null;
}

interface KnowledgeGap {
  id: string;
  question: string;
  bestScore: number | null;
  createdAt: string;
}

interface AiStats {
  totalRatings: number;
  avgRating: number;
  ratingTrend: number | null;
  lowRatedCount: number;
  knowledgeChunks: number;
  resolutionRate: number;
  escalationRate: number;
  totalSessions: number;
  aiResolvedSessions: number;
  escalatedSessions: number;
  autoExamplesCount: number;
  unresolvedGaps: number;
  topKnowledgeGaps: KnowledgeGap[];
}

interface RevenueData {
  total_revenue: number;
  total_transactions: number;
  points: Array<{ date: string; revenue: number; transactions: number }>;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
}

interface Lead {
  id: string;
  fullName: string | null;
  email: string | null;
  company: string | null;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'LOST';
  createdAt: string;
}

interface AgentRequest {
  id: string;
  action: 'BLOG_PUBLISH' | 'BLOG_UPDATE_PUBLISHED' | 'BLOG_UNPUBLISH';
  payload: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  requestedAt: string;
  resolvedAt: string | null;
  rejectionReason: string | null;
}

// ─── Sparkline (SVG) ─────────────────────────────────────

function Sparkline({
  data,
  color = '#0d9488',
  height = 60,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 300;
  const h = height;
  const pad = 4;
  const step = (w - pad * 2) / Math.max(data.length - 1, 1);

  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v / max) * (h - pad * 2));
    return `${x},${y}`;
  });

  const areaPoints = [
    `${pad},${h - pad}`,
    ...points,
    `${pad + (data.length - 1) * step},${h - pad}`,
  ].join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#sg-${color.replace('#', '')})`} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Metric Card ─────────────────────────────────────────

function MetricCard({
  title,
  value,
  change,
  unit = '',
  icon: Icon,
  color,
  sparkData,
}: {
  title: string;
  value: number;
  change: number | null;
  unit?: string;
  icon: React.ElementType;
  color: string;
  sparkData?: number[];
}) {
  const positive = change === null || change >= 0;
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-nx-gray">{title}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div>
        <span className="text-2xl font-bold text-nx-dark">
          {unit === '$' ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : value.toLocaleString()}
        </span>
        {unit && unit !== '$' && <span className="text-nx-gray text-sm ml-1">{unit}</span>}
      </div>
      {change !== null && (
        <span className={`text-xs font-medium ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
          {positive ? '+' : ''}{change}% vs prev period
        </span>
      )}
      {sparkData && <Sparkline data={sparkData} color={color} />}
    </div>
  );
}

// ─── Line Chart ───────────────────────────────────────────

function LineChart({ data }: { data: ChartPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data.length) return <div className="h-48 flex items-center justify-center text-nx-gray/40 text-sm">No data</div>;

  const overallMax = Math.max(...data.map(d => Math.max(d.visitors, d.chats, d.leads, d.signups)), 1);

  const w = 700;
  const h = 160;
  const padL = 32;
  const padR = 16;
  const padT = 16;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const step = innerW / Math.max(data.length - 1, 1);

  const line = (key: 'visitors' | 'chats' | 'leads' | 'signups') =>
    data.map((d, i) => {
      const x = padL + i * step;
      const y = padT + innerH - (d[key] / overallMax) * innerH;
      return `${x},${y}`;
    }).join(' ');

  const xLabels = data
    .filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1)
    .map((d) => ({
      label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      x: padL + data.indexOf(d) * step,
    }));

  const series = [
    { key: 'visitors' as const, color: '#0d9488', label: 'Visitors' },
    { key: 'chats' as const,    color: '#0ea5e9', label: 'Chats' },
    { key: 'leads' as const,    color: '#10b981', label: 'Leads' },
    { key: 'signups' as const,  color: '#f59e0b', label: 'Signups' },
  ];

  return (
    <div className="relative">
      <div className="flex gap-4 mb-3">
        {series.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-nx-gray">
            <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: h }}
        onMouseLeave={() => setHovered(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = padT + innerH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
                {Math.round(overallMax * frac)}
              </text>
            </g>
          );
        })}

        {xLabels.map(({ label, x }) => (
          <text key={label} x={x} y={h - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {label}
          </text>
        ))}

        {series.map(s => (
          <polyline
            key={s.key}
            points={line(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {data.map((d, i) => {
          const x = padL + i * step;
          return (
            <g key={i}>
              <rect
                x={x - step / 2} y={padT} width={step} height={innerH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
              {hovered === i && (
                <>
                  <line x1={x} y1={padT} x2={x} y2={padT + innerH} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 2" />
                  {series.map(s => {
                    const y = padT + innerH - (d[s.key] / overallMax) * innerH;
                    return <circle key={s.key} cx={x} cy={y} r="4" fill={s.color} />;
                  })}
                </>
              )}
            </g>
          );
        })}
      </svg>

      {hovered !== null && (
        <div
          className="absolute top-6 bg-nx-dark border border-gray-200 rounded-lg px-3 py-2 text-xs text-white pointer-events-none z-10 shadow-xl"
          style={{ left: `${((hovered / Math.max(data.length - 1, 1)) * 100).toFixed(1)}%`, transform: 'translateX(-50%)' }}
        >
          <div className="font-semibold mb-1 text-white/70">
            {new Date(data[hovered].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          {series.map(s => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.color }} />
              <span className="text-white/60">{s.label}:</span>
              <span className="font-medium">{data[hovered][s.key]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────

export default function AdminDashboard() {
  const { track } = useAnalytics();

  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [agentRequests, setAgentRequests] = useState<AgentRequest[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingGap, setResolvingGap] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);
    try {
      const [m, c, v, ai, rev, lds, notifs] = await Promise.all([
        api.get<MetricsData>(`/api/dashboard/metrics?period=${period}`),
        api.get<ChartPoint[]>(`/api/dashboard/chart?days=${period === 'day' ? 1 : period === 'month' ? 30 : 7}`),
        api.get<Visitor[]>('/api/dashboard/visitors?limit=10'),
        api.get<AiStats>('/api/dashboard/ai-stats'),
        api.get<RevenueData>(`/api/dashboard/revenue?days=${period === 'day' ? 1 : period === 'month' ? 30 : 7}`),
        api.get<Lead[]>('/api/leads?limit=10').catch(() => [] as Lead[]),
        api.get<Notification[]>('/api/dashboard/notifications').catch(() => [] as Notification[]),
      ]);
      setMetrics(m);
      setChart(c);
      setVisitors(v);
      setAiStats(ai);
      setRevenue(rev);
      setLeads(lds);
      setNotifications(notifs);
    } catch (e: any) {
      setError(e?.error ?? 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    track(PRODUCT.DASHBOARD_VIEWED, 'PRODUCT', { section: 'admin' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close notifications on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const resolveGap = async (id: string) => {
    setResolvingGap(id);
    try {
      await api.patch(`/api/dashboard/knowledge-gaps/${id}/resolve`, {});
      setAiStats(prev => prev ? {
        ...prev,
        unresolvedGaps: prev.unresolvedGaps - 1,
        topKnowledgeGaps: prev.topKnowledgeGaps.filter(g => g.id !== id),
      } : prev);
    } catch {
      // ignore
    } finally {
      setResolvingGap(null);
    }
  };

  const markAllRead = async () => {
    if (!notifications.length) return;
    await api.post('/api/dashboard/notifications/read', { ids: notifications.map(n => n.id) }).catch(() => {});
    setNotifications([]);
    setNotifOpen(false);
  };

  const fetchAgentRequests = useCallback(async () => {
    setAgentLoading(true);
    try {
      const res = await api.get<{ requests: AgentRequest[] }>('/api/admin/agent-requests?limit=50');
      setAgentRequests(res.requests);
    } catch {
      // non-fatal — don't block dashboard
    } finally {
      setAgentLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAgentRequests(); }, [fetchAgentRequests]);

  const handleAgentApprove = async (id: string) => {
    await api.post(`/api/admin/agent-requests/${id}/approve`, {});
    setAgentRequests(prev => prev.filter(r => r.id !== id));
  };

  const handleAgentReject = async (id: string) => {
    await api.post(`/api/admin/agent-requests/${id}/reject`, {});
    setAgentRequests(prev => prev.filter(r => r.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-nx-light flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-gray-200 border-t-nx-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-nx-light" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* Dashboard toolbar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-nx-dark">Dashboard</h1>

          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1">
              {(['day', 'week', 'month'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    period === p
                      ? 'bg-white text-nx-dark shadow-sm border border-gray-200'
                      : 'text-nx-gray hover:text-nx-dark'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            <button
              onClick={() => void fetchAll(true)}
              disabled={refreshing}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-all disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={`text-nx-gray ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(o => !o)}
                className="relative p-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-all"
                title="Notifications"
              >
                <Bell size={14} className="text-nx-gray" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-nx-dark">Notifications</span>
                    {notifications.length > 0 && (
                      <button onClick={markAllRead} className="text-xs text-nx-primary hover:text-nx-primary/80 transition-colors">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-nx-gray/50 text-sm">All caught up!</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="px-4 py-3 hover:bg-nx-light transition-colors">
                          <div className="text-sm text-nx-dark">{n.title}</div>
                          {n.body && <div className="text-xs text-nx-gray mt-0.5">{n.body}</div>}
                          <div className="text-[10px] text-nx-gray/50 mt-1">
                            {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
        )}

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard title="Unique Visitors"   value={metrics?.visitors.value ?? 0}   change={metrics?.visitors.change ?? null}   icon={Users}        color="#0d9488" sparkData={chart.map(d => d.visitors)} />
          <MetricCard title="Chat Sessions"     value={metrics?.chats.value ?? 0}      change={metrics?.chats.change ?? null}      icon={MessageSquare} color="#0ea5e9" sparkData={chart.map(d => d.chats)} />
          <MetricCard title="Leads"             value={metrics?.leads.value ?? 0}      change={metrics?.leads.change ?? null}      icon={TrendingUp}   color="#10b981" sparkData={chart.map(d => d.leads)} />
          <MetricCard title="Signups"           value={metrics?.signups.value ?? 0}    change={metrics?.signups.change ?? null}    icon={Users}        color="#f59e0b" sparkData={chart.map(d => d.signups)} />
          <MetricCard title="Conversion Rate"   value={metrics?.conversion.value ?? 0} change={null} unit="%" icon={Percent} color="#ec4899" />
        </div>

        {/* Chart + Revenue */}
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-nx-dark mb-4">Traffic Overview</h2>
            <LineChart data={chart} />
          </div>

          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <CreditCard size={15} className="text-nx-primary" />
              <h2 className="text-sm font-semibold text-nx-dark">Revenue</h2>
            </div>
            <div>
              <div className="text-3xl font-bold text-nx-dark">
                ₪{(revenue?.total_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-nx-gray mt-1">{revenue?.total_transactions ?? 0} transactions</div>
            </div>
            {revenue?.points && revenue.points.length > 0 && (
              <div className="mt-auto">
                <Sparkline data={revenue.points.map(p => p.revenue)} color="#0d9488" height={50} />
              </div>
            )}
            {!revenue?.total_revenue && (
              <div className="flex-1 flex items-center justify-center text-nx-gray/40 text-sm">No payments yet</div>
            )}
          </div>
        </div>

        {/* AI Stats + Visitors */}
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <Brain size={15} className="text-nx-primary" />
              <h2 className="text-sm font-semibold text-nx-dark">AI Assistant</h2>
            </div>

            {/* Rating row */}
            <div className="flex items-end gap-3">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-nx-dark">{aiStats?.avgRating.toFixed(1) ?? '—'}</span>
                  {aiStats?.ratingTrend !== null && aiStats?.ratingTrend !== undefined && (
                    <span className={`text-xs font-medium ${aiStats.ratingTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {aiStats.ratingTrend >= 0 ? '+' : ''}{aiStats.ratingTrend}
                    </span>
                  )}
                </div>
                <div className="flex gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={11} fill={i <= Math.round(aiStats?.avgRating ?? 0) ? '#f59e0b' : 'none'} stroke="#f59e0b" />
                  ))}
                </div>
                <div className="text-xs text-nx-gray mt-1">{aiStats?.totalRatings ?? 0} ratings</div>
              </div>
            </div>

            {/* 4-stat grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle size={12} className="text-emerald-600" />
                  <span className="text-xs text-emerald-700 font-medium">Resolution</span>
                </div>
                <div className="text-xl font-bold text-emerald-700">{aiStats?.resolutionRate ?? 0}%</div>
                <div className="text-[10px] text-emerald-600 mt-0.5">{aiStats?.aiResolvedSessions ?? 0} / {aiStats?.totalSessions ?? 0} sessions</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap size={12} className="text-amber-600" />
                  <span className="text-xs text-amber-700 font-medium">Escalation</span>
                </div>
                <div className="text-xl font-bold text-amber-700">{aiStats?.escalationRate ?? 0}%</div>
                <div className="text-[10px] text-amber-600 mt-0.5">{aiStats?.escalatedSessions ?? 0} escalated</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle size={12} className="text-red-500" />
                  <span className="text-xs text-red-600 font-medium">Low Rated ≤2</span>
                </div>
                <div className="text-xl font-bold text-red-600">{aiStats?.lowRatedCount ?? 0}</div>
              </div>
              <div className="bg-teal-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <BookOpen size={12} className="text-teal-600" />
                  <span className="text-xs text-teal-700 font-medium">Knowledge</span>
                </div>
                <div className="text-xl font-bold text-teal-700">{aiStats?.knowledgeChunks ?? 0}</div>
                <div className="text-[10px] text-teal-600 mt-0.5">{aiStats?.autoExamplesCount ?? 0} auto-examples</div>
              </div>
            </div>

            {/* Knowledge Gaps */}
            {(aiStats?.unresolvedGaps ?? 0) > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-nx-dark">Knowledge Gaps</span>
                  <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                    {aiStats!.unresolvedGaps} unresolved
                  </span>
                </div>
                <div className="space-y-1.5">
                  {aiStats!.topKnowledgeGaps.map(gap => (
                    <div key={gap.id} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs">
                      <span className="flex-1 text-nx-dark leading-snug line-clamp-2">{gap.question}</span>
                      <button
                        onClick={() => void resolveGap(gap.id)}
                        disabled={resolvingGap === gap.id}
                        className="shrink-0 text-[10px] font-semibold text-nx-primary hover:text-nx-primary/80 disabled:opacity-40 transition-colors mt-0.5"
                      >
                        {resolvingGap === gap.id ? '…' : 'Resolve'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl shadow-sm p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Users size={15} className="text-nx-primary" />
              <h2 className="text-sm font-semibold text-nx-dark">Recent Visitors</h2>
            </div>
            {visitors.length === 0 ? (
              <div className="text-center py-8 text-nx-gray/40 text-sm">No visitor data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-nx-gray/60 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Visitor</th>
                      <th className="text-left pb-2 font-medium">Location</th>
                      <th className="text-left pb-2 font-medium">Device</th>
                      <th className="text-right pb-2 font-medium">Pages</th>
                      <th className="text-right pb-2 font-medium">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visitors.map(v => (
                      <tr key={v.visitorId} className="hover:bg-nx-light transition-colors">
                        <td className="py-2 pr-4">
                          <div className="font-mono text-nx-gray truncate max-w-[80px]" title={v.visitorId}>
                            {v.visitorId.slice(-8)}
                          </div>
                          <div className="text-nx-gray/50 truncate max-w-[80px]">{v.ip ?? '—'}</div>
                        </td>
                        <td className="py-2 pr-4 text-nx-gray">
                          {[v.city, v.country].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="py-2 pr-4 text-nx-gray">
                          {[v.device, v.browser].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="py-2 text-right text-nx-dark font-semibold">{v.pageViews}</td>
                        <td className="py-2 text-right text-nx-gray/60">
                          {new Date(v.lastSeen).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Agent Requests */}
        {(agentLoading || agentRequests.length > 0) && (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={15} className="text-nx-primary" />
              <h2 className="text-sm font-semibold text-nx-dark">Agent Requests</h2>
              {agentRequests.filter(r => r.status === 'PENDING').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                  {agentRequests.filter(r => r.status === 'PENDING').length} pending
                </span>
              )}
            </div>
            {agentLoading ? (
              <div className="h-16 animate-pulse bg-gray-50 rounded-lg" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-nx-gray/60 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Requested</th>
                      <th className="text-left pb-2 font-medium">Action</th>
                      <th className="text-left pb-2 font-medium">Article</th>
                      <th className="text-left pb-2 font-medium">Status</th>
                      <th className="text-right pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {agentRequests.map(req => (
                      <tr key={req.id} className="hover:bg-nx-light transition-colors">
                        <td className="py-2 pr-4 text-nx-gray/60">
                          {new Date(req.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            req.action === 'BLOG_PUBLISH'          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            req.action === 'BLOG_UPDATE_PUBLISHED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                     'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {req.action === 'BLOG_PUBLISH' ? 'Publish' : req.action === 'BLOG_UPDATE_PUBLISHED' ? 'Update Live' : 'Unpublish'}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-nx-gray font-mono text-[10px] max-w-[200px] truncate">
                          {req.payload?.articleId ?? JSON.stringify(req.payload).slice(0, 40)}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            req.status === 'PENDING'  ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            req.status === 'EXECUTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            req.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
                                                        'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>{req.status}</span>
                        </td>
                        <td className="py-2 text-right">
                          {req.status === 'PENDING' && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleAgentApprove(req.id)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-[10px] font-medium border border-emerald-200"
                              >
                                <CheckCircle size={11} />
                                Approve
                              </button>
                              <button
                                onClick={() => handleAgentReject(req.id)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-[10px] font-medium border border-red-200"
                              >
                                <XCircle size={11} />
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Leads */}
        {leads.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} className="text-emerald-600" />
              <h2 className="text-sm font-semibold text-nx-dark">Recent Leads</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-nx-gray/60 border-b border-gray-100">
                    <th className="text-left pb-2 font-medium">Name</th>
                    <th className="text-left pb-2 font-medium">Email</th>
                    <th className="text-left pb-2 font-medium">Company</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                    <th className="text-right pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-nx-light transition-colors">
                      <td className="py-2 pr-4 text-nx-dark">{lead.fullName ?? '—'}</td>
                      <td className="py-2 pr-4 text-nx-gray font-mono text-[10px]">{lead.email ?? '—'}</td>
                      <td className="py-2 pr-4 text-nx-gray">{lead.company ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          lead.status === 'NEW'       ? 'bg-blue-50 text-blue-600 border-blue-200' :
                          lead.status === 'CONTACTED' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                          lead.status === 'QUALIFIED' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                                        'bg-red-50 text-red-600 border-red-200'
                        }`}>{lead.status}</span>
                      </td>
                      <td className="py-2 text-right text-nx-gray/60">
                        {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
