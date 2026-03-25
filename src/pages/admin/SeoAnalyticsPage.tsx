import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BarChart3, Search, Globe, Monitor, Smartphone, Tablet, Loader2,
  ArrowDown, TrendingUp, Eye, MousePointerClick, MapPin,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../lib/api';

// ─── Types (normalised — what the UI works with) ─────────

interface GscOverview {
  clicks: number;
  impressions: number;
  ctr: number;       // already a percentage, e.g. 1.5 means 1.5%
  position: number;
}

interface GscQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;       // percentage
  position: number;
}

interface GscPage {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;       // percentage
  position: number;
}

interface Ga4Overview {
  sessions: number;
  users: number;
  pageviews: number;
  bounceRate: number; // percentage
}

interface TrafficSource {
  source: string;
  sessions: number;
  users: number;
}

interface DeviceData {
  device: string;
  sessions: number;
  users: number;
}

type DateRange = '7' | '14' | '28' | '30';

// ─── Normalizers (map backend field names → UI field names) ──

function normalizeGscOverview(raw: any): GscOverview {
  return {
    clicks:      raw.total_clicks      ?? raw.clicks      ?? 0,
    impressions: raw.total_impressions  ?? raw.impressions  ?? 0,
    ctr:         raw.avg_ctr_pct        ?? raw.ctr_pct      ?? raw.ctr ?? 0,
    position:    raw.avg_position       ?? raw.position     ?? 0,
  };
}

function normalizeGscRows(raw: any, arrayKey: string): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw?.[arrayKey] && Array.isArray(raw[arrayKey])) return raw[arrayKey];
  if (raw?.rows && Array.isArray(raw.rows)) return raw.rows;
  return [];
}

function normalizeGscQuery(raw: any): GscQuery {
  return {
    query:       raw.query       ?? '',
    clicks:      raw.clicks      ?? 0,
    impressions: raw.impressions ?? 0,
    ctr:         raw.ctr_pct     ?? raw.ctr ?? 0,
    position:    raw.position    ?? 0,
  };
}

function normalizeGscPage(raw: any): GscPage {
  return {
    page:        raw.page        ?? '',
    clicks:      raw.clicks      ?? 0,
    impressions: raw.impressions ?? 0,
    ctr:         raw.ctr_pct     ?? raw.ctr ?? 0,
    position:    raw.position    ?? 0,
  };
}

function normalizeGa4Overview(raw: any): Ga4Overview {
  return {
    sessions:   raw.sessions   ?? 0,
    users:      raw.users      ?? 0,
    pageviews:  raw.pageviews  ?? raw.screenPageViews ?? 0,
    bounceRate: raw.bounce_rate_pct ?? raw.bounceRate ?? 0,
  };
}

function normalizeTrafficSources(raw: any): TrafficSource[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw?.sources ?? raw?.rows ?? [];
  return arr.map((s: any) => ({
    source:   s.channel ?? s.source ?? s.sessionDefaultChannelGroup ?? '—',
    sessions: s.sessions ?? 0,
    users:    s.users    ?? 0,
  }));
}

function normalizeDevices(raw: any): DeviceData[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw?.devices ?? raw?.rows ?? [];
  return arr.map((d: any) => ({
    device:   d.device ?? d.deviceCategory ?? '—',
    sessions: d.sessions ?? 0,
    users:    d.users    ?? 0,
  }));
}

// ─── Component ────────────────────────────────────────────

export default function SeoAnalyticsPage() {
  const { pathname } = useLocation();
  const isHe = pathname.startsWith('/he/') || pathname === '/he';

  const [days, setDays] = useState<DateRange>('30');
  const [loading, setLoading] = useState(true);

  // Data states
  const [gscOverview, setGscOverview] = useState<GscOverview | null>(null);
  const [gscQueries, setGscQueries] = useState<GscQuery[]>([]);
  const [gscPages, setGscPages] = useState<GscPage[]>([]);
  const [ga4Overview, setGa4Overview] = useState<Ga4Overview | null>(null);
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([]);
  const [devices, setDevices] = useState<DeviceData[]>([]);

  // Error states per section
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrors({});

    const endpoints = [
      { key: 'gscOverview', path: `/api/admin/seo/google/search-console/overview?days=${days}` },
      { key: 'gscQueries', path: `/api/admin/seo/google/search-console/queries?days=${days}&limit=20` },
      { key: 'gscPages', path: `/api/admin/seo/google/search-console/pages?days=${days}&limit=20` },
      { key: 'ga4Overview', path: `/api/admin/seo/google/analytics/overview?days=${days}` },
      { key: 'trafficSources', path: `/api/admin/seo/google/analytics/sources?days=${days}` },
      { key: 'devices', path: `/api/admin/seo/google/analytics/devices?days=${days}` },
    ];

    const results = await Promise.allSettled(
      endpoints.map((ep) => api.get(ep.path)),
    );

    const newErrors: Record<string, string> = {};

    results.forEach((result, i) => {
      const key = endpoints[i].key;
      if (result.status === 'fulfilled') {
        const data = result.value as any;
        try {
          switch (key) {
            case 'gscOverview':
              setGscOverview(normalizeGscOverview(data));
              break;
            case 'gscQueries':
              setGscQueries(normalizeGscRows(data, 'queries').map(normalizeGscQuery));
              break;
            case 'gscPages':
              setGscPages(normalizeGscRows(data, 'pages').map(normalizeGscPage));
              break;
            case 'ga4Overview':
              setGa4Overview(normalizeGa4Overview(data));
              break;
            case 'trafficSources':
              setTrafficSources(normalizeTrafficSources(data));
              break;
            case 'devices':
              setDevices(normalizeDevices(data));
              break;
          }
        } catch {
          newErrors[key] = 'unavailable';
        }
      } else {
        newErrors[key] = 'unavailable';
      }
    });

    setErrors(newErrors);
    setLoading(false);
  }, [days]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const DATE_OPTIONS: { value: DateRange; label: string }[] = [
    { value: '7', label: isHe ? '7 ימים' : '7 days' },
    { value: '14', label: isHe ? '14 ימים' : '14 days' },
    { value: '28', label: isHe ? '28 ימים' : '28 days' },
    { value: '30', label: isHe ? '30 ימים' : '30 days' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stripe-dark">
            {isHe ? 'אנליטיקס SEO' : 'SEO Analytics'}
          </h1>
          <p className="text-sm text-stripe-gray mt-1">
            {isHe ? 'נתונים מ-Google Search Console ו-Analytics' : 'Data from Google Search Console & Analytics'}
          </p>
        </div>

        {/* Date range selector */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {DATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                days === opt.value
                  ? 'bg-white text-stripe-dark shadow-sm'
                  : 'text-stripe-gray hover:text-stripe-dark'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-stripe-purple" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* ─── GSC Overview KPIs ──────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-stripe-dark mb-4 flex items-center gap-2">
              <Search size={18} className="text-stripe-purple" />
              Google Search Console
            </h2>
            {errors.gscOverview ? (
              <UnavailableCard isHe={isHe} />
            ) : gscOverview ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  label={isHe ? 'קליקים' : 'Clicks'}
                  value={formatNumber(gscOverview.clicks)}
                  icon={MousePointerClick}
                  color="#635bff"
                />
                <KpiCard
                  label={isHe ? 'חשיפות' : 'Impressions'}
                  value={formatNumber(gscOverview.impressions)}
                  icon={Eye}
                  color="#10b981"
                />
                <KpiCard
                  label="CTR"
                  value={`${gscOverview.ctr.toFixed(1)}%`}
                  icon={TrendingUp}
                  color="#f59e0b"
                />
                <KpiCard
                  label={isHe ? 'מיקום ממוצע' : 'Avg. Position'}
                  value={gscOverview.position.toFixed(1)}
                  icon={MapPin}
                  color="#ef4444"
                />
              </div>
            ) : null}
          </section>

          {/* ─── Top Queries ────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-stripe-dark mb-3">
              {isHe ? 'שאילתות מובילות' : 'Top Queries'}
            </h2>
            {errors.gscQueries ? (
              <UnavailableCard isHe={isHe} />
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-start px-4 py-2.5 font-medium text-stripe-gray">
                          {isHe ? 'שאילתה' : 'Query'}
                        </th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'קליקים' : 'Clicks'}</th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'חשיפות' : 'Impr.'}</th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">CTR</th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'מיקום' : 'Pos.'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscQueries.map((q, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-stripe-dark max-w-xs truncate">{q.query}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatNumber(q.clicks)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-stripe-gray">{formatNumber(q.impressions)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-stripe-gray">{q.ctr.toFixed(1)}%</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-stripe-gray">{q.position.toFixed(1)}</td>
                        </tr>
                      ))}
                      {gscQueries.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-stripe-gray text-xs">{isHe ? 'אין נתונים' : 'No data'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ─── Top Pages ──────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-stripe-dark mb-3">
              {isHe ? 'עמודים מובילים' : 'Top Pages'}
            </h2>
            {errors.gscPages ? (
              <UnavailableCard isHe={isHe} />
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-start px-4 py-2.5 font-medium text-stripe-gray">
                          {isHe ? 'עמוד' : 'Page'}
                        </th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'קליקים' : 'Clicks'}</th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'חשיפות' : 'Impr.'}</th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">CTR</th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'מיקום' : 'Pos.'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscPages.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-stripe-dark max-w-md truncate" dir="ltr">{p.page}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatNumber(p.clicks)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-stripe-gray">{formatNumber(p.impressions)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-stripe-gray">{p.ctr.toFixed(1)}%</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-stripe-gray">{p.position.toFixed(1)}</td>
                        </tr>
                      ))}
                      {gscPages.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-stripe-gray text-xs">{isHe ? 'אין נתונים' : 'No data'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ─── GA4 Overview ───────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-stripe-dark mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-emerald-600" />
              Google Analytics
            </h2>
            {errors.ga4Overview ? (
              <UnavailableCard isHe={isHe} />
            ) : ga4Overview ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  label={isHe ? 'סשנים' : 'Sessions'}
                  value={formatNumber(ga4Overview.sessions)}
                  icon={Globe}
                  color="#635bff"
                />
                <KpiCard
                  label={isHe ? 'משתמשים' : 'Users'}
                  value={formatNumber(ga4Overview.users)}
                  icon={Eye}
                  color="#10b981"
                />
                <KpiCard
                  label={isHe ? 'צפיות בעמודים' : 'Pageviews'}
                  value={formatNumber(ga4Overview.pageviews)}
                  icon={MousePointerClick}
                  color="#f59e0b"
                />
                <KpiCard
                  label={isHe ? 'שיעור נטישה' : 'Bounce Rate'}
                  value={`${ga4Overview.bounceRate.toFixed(1)}%`}
                  icon={ArrowDown}
                  color="#ef4444"
                />
              </div>
            ) : null}
          </section>

          {/* ─── Traffic Sources ─────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-stripe-dark mb-3">
              {isHe ? 'מקורות תנועה' : 'Traffic Sources'}
            </h2>
            {errors.trafficSources ? (
              <UnavailableCard isHe={isHe} />
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-start px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'ערוץ' : 'Channel'}</th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'סשנים' : 'Sessions'}</th>
                        <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">{isHe ? 'משתמשים' : 'Users'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trafficSources.map((s, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-stripe-dark">{s.source}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatNumber(s.sessions)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-stripe-gray">{formatNumber(s.users)}</td>
                        </tr>
                      ))}
                      {trafficSources.length === 0 && (
                        <tr><td colSpan={3} className="px-4 py-8 text-center text-stripe-gray text-xs">{isHe ? 'אין נתונים' : 'No data'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ─── Devices ────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-stripe-dark mb-3">
              {isHe ? 'מכשירים' : 'Devices'}
            </h2>
            {errors.devices ? (
              <UnavailableCard isHe={isHe} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {devices.map((d, i) => {
                  const Icon = d.device.toLowerCase().includes('mobile') ? Smartphone
                    : d.device.toLowerCase().includes('tablet') ? Tablet
                    : Monitor;
                  return (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-stripe-purple/10 flex items-center justify-center">
                          <Icon size={20} className="text-stripe-purple" />
                        </div>
                        <div className="text-sm font-semibold text-stripe-dark capitalize">{d.device}</div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-stripe-gray">
                        <span>{formatNumber(d.sessions)} {isHe ? 'סשנים' : 'sessions'}</span>
                        <span>{formatNumber(d.users)} {isHe ? 'משתמשים' : 'users'}</span>
                      </div>
                    </div>
                  );
                })}
                {devices.length === 0 && (
                  <div className="col-span-3 text-center py-8 text-stripe-gray text-xs">
                    {isHe ? 'אין נתונים' : 'No data'}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────

function KpiCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-stripe-gray">{label}</span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-stripe-dark">{value}</div>
    </div>
  );
}

function UnavailableCard({ isHe }: { isHe: boolean }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm flex items-center gap-2">
      <AlertTriangle size={16} />
      {isHe ? 'נתון לא זמין כרגע' : 'Data currently unavailable'}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
