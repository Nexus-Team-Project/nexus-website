import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import {
  Users, MessageSquare, TrendingUp, Percent,
  Star, Brain, CreditCard, RefreshCw, LogOut, Bell,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
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

interface AiStats {
  totalRatings: number;
  avgRating: number;
  lowRatedCount: number;
  knowledgeChunks: number;
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

// ─── Sparkline (SVG) ─────────────────────────────────────

function Sparkline({
  data,
  color = '#8b5cf6',
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
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#sg-${color.replace('#', '')})`}
      />
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
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">{title}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center`} style={{ background: `${color}33` }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <div>
        <span className="text-3xl font-bold text-white">
          {unit === '$' ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : value.toLocaleString()}
        </span>
        {unit && unit !== '$' && <span className="text-white/50 text-sm ml-1">{unit}</span>}
      </div>
      {change !== null && (
        <span className={`text-xs font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>
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

  if (!data.length) return <div className="h-48 flex items-center justify-center text-white/30 text-sm">No data</div>;

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
    { key: 'visitors' as const, color: '#8b5cf6', label: 'Visitors' },
    { key: 'chats' as const, color: '#06b6d4', label: 'Chats' },
    { key: 'leads' as const, color: '#10b981', label: 'Leads' },
    { key: 'signups' as const, color: '#f59e0b', label: 'Signups' },
  ];

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex gap-4 mb-3">
        {series.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-white/60">
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
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = padT + innerH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)">
                {Math.round(overallMax * frac)}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {xLabels.map(({ label, x }) => (
          <text key={label} x={x} y={h - 4} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)">
            {label}
          </text>
        ))}

        {/* Lines */}
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

        {/* Hover hitboxes + dots */}
        {data.map((d, i) => {
          const x = padL + i * step;
          return (
            <g key={i}>
              <rect
                x={x - step / 2}
                y={padT}
                width={step}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
              {hovered === i && (
                <>
                  <line x1={x} y1={padT} x2={x} y2={padT + innerH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 2" />
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

      {/* Hover tooltip */}
      {hovered !== null && (
        <div
          className="absolute top-6 bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white pointer-events-none z-10 shadow-xl"
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { track } = useAnalytics();

  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    track(PRODUCT.DASHBOARD_VIEWED, 'PRODUCT', { section: 'admin' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const markAllRead = async () => {
    if (!notifications.length) return;
    const ids = notifications.map(n => n.id);
    await api.post('/api/dashboard/notifications/read', { ids }).catch(() => {});
    setNotifications([]);
    setNotifOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-gray-950/90 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg" />
          <span className="font-semibold text-lg">Nexus Admin</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            {(['day', 'week', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${period === p ? 'bg-purple-600 text-white' : 'text-white/50 hover:text-white'}`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => void fetchAll(true)}
            disabled={refreshing}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {/* Notifications bell */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(o => !o)}
              className="relative p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
              title="Notifications"
            >
              <Bell size={16} />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-10 w-80 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <span className="text-sm font-semibold text-white">Notifications</span>
                  {notifications.length > 0 && (
                    <button onClick={markAllRead} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-white/30 text-sm">All caught up!</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="px-4 py-3">
                        <div className="text-sm text-white/80">{n.title}</div>
                        {n.body && <div className="text-xs text-white/40 mt-0.5">{n.body}</div>}
                        <div className="text-[10px] text-white/30 mt-1">
                          {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <span className="text-sm text-white/40">{user?.fullName}</span>
          <button onClick={handleLogout} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Unique Visitors"
            value={metrics?.visitors.value ?? 0}
            change={metrics?.visitors.change ?? null}
            icon={Users}
            color="#8b5cf6"
            sparkData={chart.map(d => d.visitors)}
          />
          <MetricCard
            title="Chat Sessions"
            value={metrics?.chats.value ?? 0}
            change={metrics?.chats.change ?? null}
            icon={MessageSquare}
            color="#06b6d4"
            sparkData={chart.map(d => d.chats)}
          />
          <MetricCard
            title="Leads"
            value={metrics?.leads.value ?? 0}
            change={metrics?.leads.change ?? null}
            icon={TrendingUp}
            color="#10b981"
            sparkData={chart.map(d => d.leads)}
          />
          <MetricCard
            title="Signups"
            value={metrics?.signups.value ?? 0}
            change={metrics?.signups.change ?? null}
            icon={Users}
            color="#f59e0b"
            sparkData={chart.map(d => d.signups)}
          />
          <MetricCard
            title="Conversion Rate"
            value={metrics?.conversion.value ?? 0}
            change={null}
            unit="%"
            icon={Percent}
            color="#ec4899"
          />
        </div>

        {/* Chart + Revenue row */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Line chart */}
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-white/70 mb-4">Traffic Overview</h2>
            <LineChart data={chart} />
          </div>

          {/* Revenue summary */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-white/70">Revenue</h2>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">
                ₪{(revenue?.total_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-white/40 mt-1">{revenue?.total_transactions ?? 0} transactions</div>
            </div>
            {revenue?.points && revenue.points.length > 0 && (
              <div className="mt-auto">
                <Sparkline data={revenue.points.map(p => p.revenue)} color="#8b5cf6" height={50} />
              </div>
            )}
            {!revenue?.total_revenue && (
              <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
                No payments yet
              </div>
            )}
          </div>
        </div>

        {/* AI Stats + Visitors row */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* AI stats */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Brain size={16} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white/70">AI Assistant</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold text-white">{aiStats?.avgRating.toFixed(1) ?? '—'}</div>
                <div className="text-xs text-white/40 mt-1">Avg Rating</div>
                <div className="flex gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={10} fill={i <= Math.round(aiStats?.avgRating ?? 0) ? '#f59e0b' : 'none'} stroke="#f59e0b" />
                  ))}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{aiStats?.totalRatings ?? 0}</div>
                <div className="text-xs text-white/40 mt-1">Total Ratings</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-400">{aiStats?.lowRatedCount ?? 0}</div>
                <div className="text-xs text-white/40 mt-1">Low Rated ≤2</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{aiStats?.knowledgeChunks ?? 0}</div>
                <div className="text-xs text-white/40 mt-1">Knowledge Chunks</div>
              </div>
            </div>
          </div>

          {/* Visitors table */}
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-white/70">Recent Visitors</h2>
            </div>
            {visitors.length === 0 ? (
              <div className="text-center py-8 text-white/20 text-sm">No visitor data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-white/30 border-b border-white/10">
                      <th className="text-left pb-2 font-medium">Visitor</th>
                      <th className="text-left pb-2 font-medium">Location</th>
                      <th className="text-left pb-2 font-medium">Device</th>
                      <th className="text-right pb-2 font-medium">Pages</th>
                      <th className="text-right pb-2 font-medium">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {visitors.map(v => (
                      <tr key={v.visitorId} className="hover:bg-white/5 transition-colors">
                        <td className="py-2 pr-4">
                          <div className="font-mono text-white/50 truncate max-w-[80px]" title={v.visitorId}>
                            {v.visitorId.slice(-8)}
                          </div>
                          <div className="text-white/30 truncate max-w-[80px]">{v.ip ?? '—'}</div>
                        </td>
                        <td className="py-2 pr-4 text-white/60">
                          {[v.city, v.country].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="py-2 pr-4 text-white/60">
                          {[v.device, v.browser].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="py-2 text-right text-white/70 font-medium">{v.pageViews}</td>
                        <td className="py-2 text-right text-white/40">
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

        {/* Leads table */}
        {leads.length > 0 && (
          <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white/70">Recent Leads</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/30 border-b border-white/10">
                    <th className="text-left pb-2 font-medium">Name</th>
                    <th className="text-left pb-2 font-medium">Email</th>
                    <th className="text-left pb-2 font-medium">Company</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                    <th className="text-right pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2 pr-4 text-white/80">{lead.fullName ?? '—'}</td>
                      <td className="py-2 pr-4 text-white/60 font-mono text-[10px]">{lead.email ?? '—'}</td>
                      <td className="py-2 pr-4 text-white/60">{lead.company ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          lead.status === 'NEW'       ? 'bg-blue-500/20 text-blue-300' :
                          lead.status === 'CONTACTED' ? 'bg-amber-500/20 text-amber-300' :
                          lead.status === 'QUALIFIED' ? 'bg-green-500/20 text-green-300' :
                                                        'bg-red-500/20 text-red-300'
                        }`}>{lead.status}</span>
                      </td>
                      <td className="py-2 text-right text-white/40">
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
