import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BarChart3, Search, Globe, Monitor, Smartphone, Tablet, Loader2,
  ArrowDown, TrendingUp, Eye, MousePointerClick, MapPin,
  AlertTriangle, Calendar, Sparkles, Zap, Activity, Target,
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

// ─── Google Trends types ──────────────────────────────────

interface TrendsTimelineEntry {
  date: string;
  values: Array<{ keyword: string; value: number }>;
}

interface TrendsInterest {
  keywords: string[];
  period_days: number;
  geo: string;
  timeline: TrendsTimelineEntry[];
}

interface RelatedQueriesData {
  keyword: string;
  geo: string;
  top: Array<{ query: string; value: number }>;
  rising: Array<{ query: string; trend: string }>;
}

interface DailyTrend {
  query: string;
  traffic: string;
  relatedQueries: string[];
  context: string | null;
}

interface DailyTrendsData {
  date: string;
  geo: string;
  trending: DailyTrend[];
}

// ─── Event Detection types (from trends-analyzer skill) ──

interface TrendSignal {
  query: string;
  growth: string;
  source: string;          // "rising_query" | "daily_trend" | "related_topic"
  keyword?: string;
  context?: string | null;
  related?: string[];
}

interface TrendOpportunity {
  title: string;
  keywords: string[];
  intent: string;
  angle: string;
  scores: {
    traffic: number;
    competition: number;
    relevance: number;
    urgency: number;
  };
}

interface TrendEvent {
  event_name: string;
  queries: string[];
  insight: string;
  type: string;
  duration_estimate: string;
  relevance: boolean;
  nexus_connection: string;
  opportunities: TrendOpportunity[];
}

interface TrendsAnalysisData {
  signals: TrendSignal[];
  events: TrendEvent[];
  signalsProcessed: number;
  eventsDetected: number;
  opportunityCount: number;
  discardedSignals: string[];
  model: string;
}

type DateRange = '7' | '14' | '28' | '30' | 'custom';

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
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Custom date range state
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(today);
  const customPickerRef = useRef<HTMLDivElement>(null);

  // Data states
  const [gscOverview, setGscOverview] = useState<GscOverview | null>(null);
  const [gscQueries, setGscQueries] = useState<GscQuery[]>([]);
  const [gscPages, setGscPages] = useState<GscPage[]>([]);
  const [ga4Overview, setGa4Overview] = useState<Ga4Overview | null>(null);
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([]);
  const [devices, setDevices] = useState<DeviceData[]>([]);

  // Google Trends states
  const [trendsInterest, setTrendsInterest] = useState<TrendsInterest | null>(null);
  const [trendsRelated, setTrendsRelated] = useState<RelatedQueriesData | null>(null);
  const [dailyTrends, setDailyTrends] = useState<DailyTrendsData | null>(null);

  // Event Detection states (from trends-analyzer skill)
  const [trendsAnalysis, setTrendsAnalysis] = useState<TrendsAnalysisData | null>(null);
  const [trendsAnalysisLoading, setTrendsAnalysisLoading] = useState(false);
  const [trendsAnalysisSummary, setTrendsAnalysisSummary] = useState('');

  // Error states per section
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Calculate the actual number of days to send to the API
  const effectiveDays = useCallback(() => {
    if (days !== 'custom') return days;
    const start = new Date(customStart);
    const end = new Date(customEnd);
    const diff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return String(diff);
  }, [days, customStart, customEnd]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrors({});

    const d = effectiveDays();
    const endpoints = [
      { key: 'gscOverview', path: `/api/admin/seo/google/search-console/overview?days=${d}` },
      { key: 'gscQueries', path: `/api/admin/seo/google/search-console/queries?days=${d}&limit=20` },
      { key: 'gscPages', path: `/api/admin/seo/google/search-console/pages?days=${d}&limit=20` },
      { key: 'ga4Overview', path: `/api/admin/seo/google/analytics/overview?days=${d}` },
      { key: 'trafficSources', path: `/api/admin/seo/google/analytics/sources?days=${d}` },
      { key: 'devices', path: `/api/admin/seo/google/analytics/devices?days=${d}` },
      { key: 'trendsInterest', path: `/api/admin/seo/google/trends/interest?keywords=${encodeURIComponent('תוכנית נאמנות,מועדון הטבות,מתנות לעובדים,קאשבק,שוברים')}&days=${d}` },
      { key: 'trendsRelated', path: `/api/admin/seo/google/trends/related?keyword=${encodeURIComponent('מתנות לעובדים')}` },
      { key: 'dailyTrends', path: `/api/admin/seo/google/trends/daily` },
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
            case 'trendsInterest':
              setTrendsInterest(data as TrendsInterest);
              break;
            case 'trendsRelated':
              setTrendsRelated(data as RelatedQueriesData);
              break;
            case 'dailyTrends':
              setDailyTrends(data as DailyTrendsData);
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
  }, [effectiveDays]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  /** Run the AI event-detection skill via the agent backend */
  const runTrendsAnalysis = useCallback(async () => {
    setTrendsAnalysisLoading(true);
    setErrors((prev) => { const n = { ...prev }; delete n.trendsAnalysis; return n; });
    try {
      const result = await api.post<any>('/api/admin/seo/skills/trends-analyzer/run', {
        config: { days: Number(effectiveDays()), includeCompetitors: true },
      });
      if (result.success && result.data) {
        setTrendsAnalysis(result.data as TrendsAnalysisData);
        setTrendsAnalysisSummary(result.summary ?? '');
      } else {
        setErrors((prev) => ({ ...prev, trendsAnalysis: 'unavailable' }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, trendsAnalysis: 'unavailable' }));
    } finally {
      setTrendsAnalysisLoading(false);
    }
  }, [effectiveDays]);

  const DATE_OPTIONS: { value: DateRange; label: string }[] = [
    { value: '7', label: isHe ? '7 ימים' : '7 days' },
    { value: '14', label: isHe ? '14 ימים' : '14 days' },
    { value: '28', label: isHe ? '28 ימים' : '28 days' },
    { value: '30', label: isHe ? '30 ימים' : '30 days' },
    { value: 'custom', label: isHe ? 'מותאם' : 'Custom' },
  ];

  // Close custom picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (customPickerRef.current && !customPickerRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false);
      }
    }
    if (showCustomPicker) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCustomPicker]);

  /** Apply the custom date range and fetch */
  const applyCustomRange = () => {
    setShowCustomPicker(false);
    if (days === 'custom') {
      // force refetch even if already custom
      void fetchAll();
    } else {
      setDays('custom');
    }
  };

  /** Format the custom range for display */
  const customRangeLabel = days === 'custom'
    ? `${customStart.slice(5).replace('-', '/')} – ${customEnd.slice(5).replace('-', '/')}`
    : '';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stripe-dark">
            {isHe ? 'אנליטיקס SEO' : 'SEO Analytics'}
          </h1>
          <p className="text-sm text-stripe-gray mt-1">
            {isHe ? 'נתונים מ-Google Search Console, Analytics ו-Trends' : 'Data from Google Search Console, Analytics & Trends'}
          </p>
        </div>

        {/* Date range selector */}
        <div className="relative flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {DATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  if (opt.value === 'custom') {
                    setShowCustomPicker((v) => !v);
                  } else {
                    setShowCustomPicker(false);
                    setDays(opt.value);
                  }
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                  days === opt.value
                    ? 'bg-white text-stripe-dark shadow-sm'
                    : 'text-stripe-gray hover:text-stripe-dark'
                }`}
              >
                {opt.value === 'custom' && <Calendar size={12} />}
                {opt.value === 'custom' && days === 'custom' ? customRangeLabel : opt.label}
              </button>
            ))}
          </div>

          {/* Custom date picker popover */}
          {showCustomPicker && (
            <div
              ref={customPickerRef}
              className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-50 min-w-[280px]"
            >
              <p className="text-xs font-medium text-stripe-gray mb-3">
                {isHe ? 'בחר טווח תאריכים' : 'Select date range'}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-stripe-gray mb-1">
                    {isHe ? 'מתאריך' : 'Start date'}
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-stripe-dark focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stripe-gray mb-1">
                    {isHe ? 'עד תאריך' : 'End date'}
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart}
                    max={today}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-stripe-dark focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-stripe-gray">
                    {isHe ? 'GSC מוגבל ל-90 יום' : 'GSC limited to 90 days'}
                  </span>
                  <button
                    onClick={applyCustomRange}
                    className="px-4 py-1.5 bg-stripe-purple text-white text-xs font-medium rounded-lg hover:bg-stripe-purple/90 transition-colors"
                  >
                    {isHe ? 'החל' : 'Apply'}
                  </button>
                </div>
              </div>
            </div>
          )}
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

          {/* ─── Google Trends & Event Detection ─────────────── */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-stripe-dark flex items-center gap-2">
                <TrendingUp size={18} className="text-orange-500" />
                {isHe ? 'מגמות חיפוש וזיהוי אירועים' : 'Search Trends & Event Detection'}
              </h2>
              <button
                onClick={runTrendsAnalysis}
                disabled={trendsAnalysisLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-stripe-purple text-white hover:bg-stripe-purple/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all self-start sm:self-auto"
              >
                {trendsAnalysisLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {isHe ? 'מנתח...' : 'Analyzing...'}
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    {isHe ? 'הפעל ניתוח אירועים' : 'Run Event Detection'}
                  </>
                )}
              </button>
            </div>

            {/* Event Detection Results */}
            {errors.trendsAnalysis ? (
              <UnavailableCard isHe={isHe} message={isHe ? 'ניתוח המגמות נכשל — נסה שוב מאוחר יותר' : 'Trends analysis failed — try again later'} />
            ) : trendsAnalysis ? (
              <div className="space-y-4 mb-8">
                {/* Summary banner */}
                <div className="bg-gradient-to-r from-stripe-purple/5 to-orange-50 border border-stripe-purple/10 rounded-xl p-4">
                  <div className="flex flex-wrap gap-4 mb-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Activity size={14} className="text-stripe-purple" />
                      <span className="text-stripe-gray">{isHe ? 'אותות:' : 'Signals:'}</span>
                      <span className="font-semibold text-stripe-dark">{trendsAnalysis.signalsProcessed}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Zap size={14} className="text-orange-500" />
                      <span className="text-stripe-gray">{isHe ? 'אירועים:' : 'Events:'}</span>
                      <span className="font-semibold text-stripe-dark">{trendsAnalysis.eventsDetected}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Target size={14} className="text-emerald-600" />
                      <span className="text-stripe-gray">{isHe ? 'הזדמנויות:' : 'Opportunities:'}</span>
                      <span className="font-semibold text-stripe-dark">{trendsAnalysis.opportunityCount}</span>
                    </div>
                  </div>
                  {trendsAnalysisSummary && (
                    <p className="text-sm text-stripe-dark/80 leading-relaxed">{trendsAnalysisSummary}</p>
                  )}
                </div>

                {/* ── Signals table ─────────────────────────── */}
                {trendsAnalysis.signals?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-stripe-dark mb-2 flex items-center gap-2">
                      <Activity size={14} className="text-stripe-purple" />
                      {isHe ? 'סיגנלים שזוהו' : 'Detected Signals'}
                      <span className="text-[10px] font-normal text-stripe-gray">({trendsAnalysis.signals.length})</span>
                    </h3>
                    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                              <th className="text-start px-4 py-2.5 font-medium text-stripe-gray">
                                {isHe ? 'שאילתה / נושא' : 'Query / Topic'}
                              </th>
                              <th className="text-start px-4 py-2.5 font-medium text-stripe-gray">
                                {isHe ? 'מקור' : 'Source'}
                              </th>
                              <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">
                                {isHe ? 'צמיחה' : 'Growth'}
                              </th>
                              <th className="text-start px-4 py-2.5 font-medium text-stripe-gray">
                                {isHe ? 'הקשר' : 'Context'}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {trendsAnalysis.signals.map((sig, si) => (
                              <tr key={si} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-2.5 font-medium text-stripe-dark max-w-xs">
                                  {sig.query}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    sig.source === 'daily_trend'   ? 'bg-yellow-100 text-yellow-700' :
                                    sig.source === 'rising_query'  ? 'bg-blue-100 text-blue-700' :
                                    'bg-purple-100 text-purple-700'
                                  }`}>
                                    {sig.source === 'daily_trend' ? (isHe ? 'טרנד יומי' : 'Daily') :
                                     sig.source === 'rising_query' ? (isHe ? 'שאילתה עולה' : 'Rising') :
                                     (isHe ? 'נושא קשור' : 'Topic')}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-end">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    sig.growth === 'Breakout' || sig.growth === 'פריצה'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {sig.growth}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-stripe-gray max-w-xs truncate">
                                  {sig.context ?? sig.keyword ?? (sig.related?.slice(0, 2).join(', ')) ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Event cards ─────────────────────────────── */}
                <h3 className="text-sm font-semibold text-stripe-dark flex items-center gap-2 mt-2">
                  <Zap size={14} className="text-orange-500" />
                  {isHe ? 'אירועים שזוהו' : 'Detected Events'}
                  <span className="text-[10px] font-normal text-stripe-gray">({trendsAnalysis.eventsDetected})</span>
                </h3>
                {trendsAnalysis.events.length > 0 ? (
                  <div className="space-y-4">
                    {trendsAnalysis.events.map((event, idx) => (
                      <div key={idx} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                        {/* Event header */}
                        <div className="p-5 border-b border-gray-50">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-base font-semibold text-stripe-dark">{event.event_name}</h3>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                event.type === 'seasonal' ? 'bg-blue-100 text-blue-700' :
                                event.type === 'news-driven' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {event.type === 'seasonal' ? (isHe ? 'עונתי' : 'Seasonal') :
                                 event.type === 'news-driven' ? (isHe ? 'חדשות' : 'News') :
                                 (isHe ? 'מגמה' : 'Trend')}
                              </span>
                              <span className="text-[10px] text-stripe-gray">{event.duration_estimate}</span>
                            </div>
                          </div>
                          <p className="text-sm text-stripe-gray mb-3">{event.insight}</p>

                          {/* Query tags */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {event.queries.map((q, qi) => (
                              <span key={qi} className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-stripe-dark">
                                {q}
                              </span>
                            ))}
                          </div>

                          {/* Nexus connection */}
                          {event.nexus_connection && (
                            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                              <Target size={12} className="text-emerald-600 mt-0.5 shrink-0" />
                              <span className="text-xs text-emerald-800">{event.nexus_connection}</span>
                            </div>
                          )}
                        </div>

                        {/* Opportunities */}
                        {event.opportunities?.length > 0 && (
                          <div className="p-5 bg-gray-50/30">
                            <p className="text-xs font-medium text-stripe-gray mb-3">
                              {isHe ? 'הזדמנויות תוכן' : 'Content Opportunities'}
                            </p>
                            <div className="space-y-3">
                              {event.opportunities.map((opp, oi) => (
                                <div key={oi} className="bg-white border border-gray-100 rounded-lg p-4">
                                  <div className="flex items-start justify-between mb-2">
                                    <h4 className="text-sm font-semibold text-stripe-dark leading-tight flex-1">{opp.title}</h4>
                                    <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                      opp.intent === 'transactional' ? 'bg-emerald-100 text-emerald-700' :
                                      opp.intent === 'commercial' ? 'bg-blue-100 text-blue-700' :
                                      'bg-gray-100 text-stripe-gray'
                                    }`}>
                                      {opp.intent}
                                    </span>
                                  </div>
                                  <p className="text-xs text-stripe-gray mb-2">{opp.angle}</p>

                                  {/* Keywords */}
                                  <div className="flex flex-wrap gap-1 mb-3">
                                    {opp.keywords.map((kw, ki) => (
                                      <span key={ki} className="px-1.5 py-0.5 rounded bg-stripe-purple/5 text-[10px] text-stripe-purple font-medium">
                                        {kw}
                                      </span>
                                    ))}
                                  </div>

                                  {/* Score bars */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {[
                                      { score: opp.scores.traffic, label: isHe ? 'תנועה' : 'Traffic', color: 'bg-blue-500' },
                                      { score: opp.scores.competition, label: isHe ? 'תחרות' : 'Competition', color: 'bg-emerald-500' },
                                      { score: opp.scores.relevance, label: isHe ? 'רלוונטיות' : 'Relevance', color: 'bg-stripe-purple' },
                                      { score: opp.scores.urgency, label: isHe ? 'דחיפות' : 'Urgency', color: 'bg-orange-500' },
                                    ].map((s, si) => (
                                      <div key={si}>
                                        <div className="flex items-center justify-between mb-0.5">
                                          <span className="text-[10px] text-stripe-gray">{s.label}</span>
                                          <span className="text-[10px] font-semibold text-stripe-dark">{s.score}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.score * 10}%` }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-stripe-gray text-xs">
                    {isHe ? 'לא זוהו אירועים רלוונטיים' : 'No relevant events detected'}
                  </div>
                )}

                {/* Discarded signals */}
                {trendsAnalysis.discardedSignals?.length > 0 && (
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-[10px] font-medium text-stripe-gray mb-1">
                      {isHe ? 'אותות שנדחו:' : 'Discarded signals:'}
                    </p>
                    <p className="text-[10px] text-stripe-gray/70 leading-relaxed">
                      {trendsAnalysis.discardedSignals.join(' • ')}
                    </p>
                  </div>
                )}
              </div>
            ) : !trendsAnalysisLoading ? (
              <div className="bg-gradient-to-r from-stripe-purple/5 to-orange-50 border border-dashed border-stripe-purple/20 rounded-xl p-6 text-center mb-8">
                <Sparkles size={24} className="text-stripe-purple mx-auto mb-2" />
                <p className="text-sm font-medium text-stripe-dark mb-1">
                  {isHe ? 'ניתוח אירועים מבוסס AI' : 'AI-Powered Event Detection'}
                </p>
                <p className="text-xs text-stripe-gray">
                  {isHe
                    ? 'זיהוי אירועים מעולם האמיתי מתוך מגמות חיפוש, סינון לרלוונטיות עסקית, ויצירת הזדמנויות תוכן'
                    : 'Detect real-world events from search trends, filter for business relevance, and generate content opportunities'}
                </p>
              </div>
            ) : null}
          </section>

          {/* ─── Raw Trends Data ──────────────────────────────── */}
          <section>
            <h3 className="text-sm font-medium text-stripe-gray mb-4 border-b border-gray-100 pb-2">
              {isHe ? 'נתוני מגמות גולמיים' : 'Raw Trends Data'}
            </h3>
            <div className="space-y-6">
              {/* Interest Over Time */}
              <div>
                <h4 className="text-sm font-semibold text-stripe-dark mb-2">
                  {isHe ? 'עניין לאורך זמן' : 'Interest Over Time'}
                </h4>
                {errors.trendsInterest ? (
                  <UnavailableCard isHe={isHe} message={isHe ? 'Google Trends לא זמין כרגע' : 'Google Trends temporarily unavailable'} />
                ) : trendsInterest && trendsInterest.timeline?.length > 0 ? (
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50/50">
                            <th className="text-start px-4 py-2.5 font-medium text-stripe-gray">
                              {isHe ? 'תאריך' : 'Date'}
                            </th>
                            {trendsInterest.keywords.map((kw) => (
                              <th key={kw} className="text-end px-4 py-2.5 font-medium text-stripe-gray text-xs">
                                {kw}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {trendsInterest.timeline.slice(-12).map((entry, i) => (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                              <td className="px-4 py-2.5 text-stripe-dark text-xs tabular-nums whitespace-nowrap" dir="ltr">
                                {entry.date}
                              </td>
                              {entry.values.map((v, j) => (
                                <td key={j} className="px-4 py-2.5 text-end">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-stripe-purple/70"
                                        style={{ width: `${Math.min(v.value, 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs tabular-nums text-stripe-gray w-6 text-end">
                                      {v.value}
                                    </span>
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-stripe-gray text-xs">
                    {isHe ? 'אין נתוני מגמות' : 'No trends data'}
                  </div>
                )}
              </div>

              {/* Rising Queries */}
              <div>
                <h4 className="text-sm font-semibold text-stripe-dark mb-2 flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-500" />
                  {isHe ? 'שאילתות עולות' : 'Rising Queries'}
                </h4>
                {errors.trendsRelated ? (
                  <UnavailableCard isHe={isHe} message={isHe ? 'Google Trends לא זמין כרגע' : 'Google Trends temporarily unavailable'} />
                ) : trendsRelated && trendsRelated.rising?.length > 0 ? (
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50/50">
                            <th className="text-start px-4 py-2.5 font-medium text-stripe-gray">
                              {isHe ? 'שאילתה' : 'Query'}
                            </th>
                            <th className="text-end px-4 py-2.5 font-medium text-stripe-gray">
                              {isHe ? 'מגמה' : 'Trend'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {trendsRelated.rising.slice(0, 10).map((q, i) => (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                              <td className="px-4 py-2.5 font-medium text-stripe-dark">{q.query}</td>
                              <td className="px-4 py-2.5 text-end">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  q.trend === 'Breakout' || q.trend === 'פריצה'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {q.trend}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {trendsRelated.top?.length > 0 && (
                      <div className="border-t border-gray-100 px-4 py-3">
                        <p className="text-xs font-medium text-stripe-gray mb-2">
                          {isHe ? 'שאילתות מובילות' : 'Top Queries'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {trendsRelated.top.slice(0, 8).map((q, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-xs text-stripe-gray">
                              {q.query}
                              <span className="text-stripe-purple font-semibold">{q.value}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-stripe-gray text-xs">
                    {isHe ? 'אין נתונים' : 'No data'}
                  </div>
                )}
              </div>

              {/* Trending in Israel Today */}
              <div>
                <h4 className="text-sm font-semibold text-stripe-dark mb-2 flex items-center gap-2">
                  <Zap size={14} className="text-yellow-500" />
                  {isHe ? 'טרנדים בישראל היום' : 'Trending in Israel Today'}
                </h4>
                {errors.dailyTrends ? (
                  <UnavailableCard isHe={isHe} message={isHe ? 'Google Trends לא זמין כרגע' : 'Google Trends temporarily unavailable'} />
                ) : dailyTrends && dailyTrends.trending?.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dailyTrends.trending.slice(0, 9).map((t, i) => (
                      <div key={i} className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-sm font-semibold text-stripe-dark leading-tight">
                            {t.query}
                          </h3>
                          <span className="shrink-0 ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stripe-purple/10 text-stripe-purple">
                            {t.traffic}
                          </span>
                        </div>
                        {t.context && (
                          <p className="text-xs text-stripe-gray mb-2 line-clamp-2">
                            {t.context}
                          </p>
                        )}
                        {t.relatedQueries?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {t.relatedQueries.slice(0, 4).map((rq, j) => (
                              <span key={j} className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-stripe-gray">
                                {rq}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-stripe-gray text-xs">
                    {isHe ? 'אין נתוני טרנדים' : 'No trending data'}
                  </div>
                )}
              </div>
            </div>
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

function UnavailableCard({ isHe, message }: { isHe: boolean; message?: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm flex items-center gap-2">
      <AlertTriangle size={16} />
      {message ?? (isHe ? 'נתון לא זמין כרגע' : 'Data currently unavailable')}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
