import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Bot, Play, Pause, CheckCircle, XCircle, Clock,
  AlertTriangle, Zap, Settings, List, BarChart3, ScrollText, Plus,
  ChevronDown, ChevronRight, Loader2, Save,
} from 'lucide-react';
import { api } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────

interface AgentDetail {
  id: string;
  slug: string;
  name: string;
  nameHe?: string;
  type: 'SEO' | 'MARKETING' | 'SALES';
  description: string | null;
  descriptionHe?: string | null;
  systemPrompt: string | null;
  model: string | null;
  isActive: boolean;
  color?: string;
  skills: string[];
  integrations: string[];
  _count: { tasks: number; automations: number; logs: number; budgets: number };
}

interface AgentTask {
  id: string;
  title: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED';
  skill: string | null;
  iceScore: number | null;
  createdAt: string;
}

interface AgentAutomation {
  id: string;
  name: string;
  skill: string;
  cron: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  recentRuns?: AutomationRun[];
}

interface AutomationRun {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING';
  durationMs: number | null;
  cost: number | null;
  summary: string | null;
  createdAt: string;
}

interface AgentLog {
  id: string;
  skill: string | null;
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING' | 'SKIPPED';
  tokensUsed: number | null;
  cost: number | null;
  durationMs: number | null;
  createdAt: string;
}

interface BudgetSummary {
  today: number;
  limit: number;
}

// ─── Color helpers ────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  SEO: '#10b981',
  MARKETING: '#635bff',
  SALES: '#f59e0b',
};

const STATUS_STYLES: Record<string, string> = {
  PENDING:     'bg-amber-50 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  DONE:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED:      'bg-red-50 text-red-700 border-red-200',
  SUCCESS:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  RUNNING:     'bg-blue-50 text-blue-700 border-blue-200',
  SKIPPED:     'bg-gray-50 text-gray-600 border-gray-200',
};

type TabKey = 'overview' | 'tasks' | 'automations' | 'logs' | 'settings';

const TABS: { key: TabKey; labelEn: string; labelHe: string; icon: React.ElementType }[] = [
  { key: 'overview',    labelEn: 'Overview',    labelHe: 'סקירה',     icon: BarChart3 },
  { key: 'tasks',       labelEn: 'Tasks',       labelHe: 'משימות',    icon: List },
  { key: 'automations', labelEn: 'Automations', labelHe: 'אוטומציות', icon: Zap },
  { key: 'logs',        labelEn: 'Logs',        labelHe: 'לוגים',     icon: ScrollText },
  { key: 'settings',    labelEn: 'Settings',    labelHe: 'הגדרות',    icon: Settings },
];

// ─── Main Component ───────────────────────────────────────

export default function AgentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHe = pathname.startsWith('/he/') || pathname === '/he';
  const basePath = isHe ? '/he/admin' : '/admin';

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [toggling, setToggling] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);

  const fetchAgent = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await api.get<AgentDetail>(`/api/admin/agents/${slug}`);
      setAgent(data);
    } catch (e: any) {
      setError(e?.error ?? 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void fetchAgent(); }, [fetchAgent]);

  const toggleActive = async () => {
    if (!agent) return;
    setToggling(true);
    try {
      const updated = await api.patch<AgentDetail>(`/api/admin/agents/${slug}`, {
        isActive: !agent.isActive,
      });
      setAgent(updated);
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  const runCycle = async () => {
    if (!agent) return;
    setRunningCycle(true);
    try {
      await api.post(`/api/admin/agents/${slug}/skills/report/run`, {});
    } catch {
      // ignore
    } finally {
      setRunningCycle(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full border-2 border-gray-200 border-t-stripe-purple animate-spin" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
          {error ?? 'Agent not found'}
        </div>
      </div>
    );
  }

  const color = agent.color || TYPE_COLORS[agent.type] || '#635bff';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate(`${basePath}/agents`)}
        className="flex items-center gap-1.5 text-sm text-stripe-gray hover:text-stripe-dark transition-colors mb-6"
      >
        {isHe ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
        <span>{isHe ? 'חזרה לסוכנים' : 'Back to Agents'}</span>
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${color}15` }}
            >
              <Bot size={24} style={{ color }} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-stripe-dark">
                  {isHe && agent.nameHe ? agent.nameHe : agent.name}
                </h1>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ backgroundColor: `${color}15`, color }}
                >
                  {agent.type}
                </span>
                <div className="flex items-center gap-1.5">
                  {agent.isActive ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-medium text-emerald-600">
                        {isHe ? 'פעיל' : 'Active'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-xs font-medium text-amber-600">
                        {isHe ? 'מושהה' : 'Paused'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleActive}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all disabled:opacity-50 ${
                agent.isActive
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              {agent.isActive ? <Pause size={14} /> : <Play size={14} />}
              {agent.isActive
                ? (isHe ? 'השהה' : 'Pause')
                : (isHe ? 'הפעל' : 'Activate')}
            </button>
            <button
              onClick={runCycle}
              disabled={runningCycle}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-stripe-purple text-white hover:bg-stripe-purple/90 transition-all disabled:opacity-50"
            >
              {runningCycle ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {isHe ? 'הרץ מחזור' : 'Run Cycle'}
            </button>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-gray-200 -mx-6 px-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                active
                  ? 'border-stripe-purple text-stripe-purple'
                  : 'border-transparent text-stripe-gray hover:text-stripe-dark hover:border-gray-300'
              }`}
            >
              <Icon size={15} />
              {isHe ? tab.labelHe : tab.labelEn}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview'    && <OverviewTab agent={agent} slug={slug!} isHe={isHe} color={color} />}
      {activeTab === 'tasks'       && <TasksTab slug={slug!} isHe={isHe} />}
      {activeTab === 'automations' && <AutomationsTab slug={slug!} isHe={isHe} />}
      {activeTab === 'logs'        && <LogsTab slug={slug!} isHe={isHe} />}
      {activeTab === 'settings'    && <SettingsTab agent={agent} slug={slug!} isHe={isHe} onUpdate={setAgent} />}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────

function OverviewTab({ agent, slug, isHe, color }: { agent: AgentDetail; slug: string; isHe: boolean; color: string }) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<AgentLog[]>(`/api/admin/agents/${slug}/logs?limit=10`).catch(() => []),
      api.get<BudgetSummary>(`/api/admin/agents/${slug}/budget`).catch(() => null),
    ]).then(([l, b]) => {
      setLogs(l);
      setBudget(b);
    }).finally(() => setLoadingLogs(false));
  }, [slug]);

  return (
    <div className="space-y-6">
      {/* Description */}
      {agent.description && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-stripe-dark mb-2">
            {isHe ? 'תיאור' : 'Description'}
          </h3>
          <p className="text-sm text-stripe-gray leading-relaxed">
            {isHe && agent.descriptionHe ? agent.descriptionHe : agent.description}
          </p>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={isHe ? 'סה"כ משימות' : 'Total Tasks'}
          value={agent._count.tasks}
          icon={List}
          color="#635bff"
        />
        <StatCard
          label={isHe ? 'הושלמו' : 'Completed'}
          value="—"
          icon={CheckCircle}
          color="#10b981"
        />
        <StatCard
          label={isHe ? 'אוטומציות פעילות' : 'Running Automations'}
          value={agent._count.automations}
          icon={Zap}
          color="#f59e0b"
        />
        <StatCard
          label={isHe ? 'תקציב היום' : "Today's Budget"}
          value={budget ? `$${budget.today.toFixed(2)}` : '—'}
          icon={BarChart3}
          color="#ec4899"
        />
      </div>

      {/* Recent logs */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-stripe-dark mb-4">
          {isHe ? 'לוגים אחרונים' : 'Recent Logs'}
        </h3>
        {loadingLogs ? (
          <div className="h-24 animate-pulse bg-gray-50 rounded-lg" />
        ) : logs.length === 0 ? (
          <p className="text-sm text-stripe-gray/50 text-center py-6">
            {isHe ? 'אין לוגים עדיין' : 'No logs yet'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stripe-gray/60 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">{isHe ? 'זמן' : 'Time'}</th>
                  <th className="text-left pb-2 font-medium">{isHe ? 'כישור' : 'Skill'}</th>
                  <th className="text-left pb-2 font-medium">{isHe ? 'פעולה' : 'Action'}</th>
                  <th className="text-left pb-2 font-medium">{isHe ? 'סטטוס' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-stripe-light transition-colors">
                    <td className="py-2 pr-4 text-stripe-gray/60 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 pr-4 text-stripe-gray font-mono">{log.skill ?? '—'}</td>
                    <td className="py-2 pr-4 text-stripe-dark">{log.action}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={log.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tasks Tab ────────────────────────────────────────────

function TasksTab({ slug, isHe }: { slug: string; isHe: boolean }) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const query = filter !== 'ALL' ? `?status=${filter}` : '';
      const data = await api.get<AgentTask[]>(`/api/admin/agents/${slug}/tasks${query}`);
      setTasks(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [slug, filter]);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);

  const createTask = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const task = await api.post<AgentTask>(`/api/admin/agents/${slug}/tasks`, {
        title: newTitle.trim(),
        skill: newSkill.trim() || undefined,
      });
      setTasks((prev) => [task, ...prev]);
      setNewTitle('');
      setNewSkill('');
      setShowForm(false);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      await api.patch(`/api/admin/agents/${slug}/tasks/${taskId}`, { status });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: status as AgentTask['status'] } : t)));
    } catch {
      // ignore
    }
  };

  const STATUSES = ['ALL', 'PENDING', 'IN_PROGRESS', 'DONE', 'FAILED'];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                filter === s
                  ? 'bg-white text-stripe-dark shadow-sm border border-gray-200'
                  : 'text-stripe-gray hover:text-stripe-dark'
              }`}
            >
              {s === 'ALL' ? (isHe ? 'הכל' : 'All') : s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-stripe-purple text-white hover:bg-stripe-purple/90 transition-all"
        >
          <Plus size={13} />
          {isHe ? 'משימה חדשה' : 'New Task'}
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder={isHe ? 'כותרת המשימה...' : 'Task title...'}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
            />
            <input
              type="text"
              placeholder={isHe ? 'כישור (אופציונלי)' : 'Skill (optional)'}
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              className="sm:w-40 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
            />
            <div className="flex gap-2">
              <button
                onClick={createTask}
                disabled={creating || !newTitle.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-stripe-purple text-white hover:bg-stripe-purple/90 transition-all disabled:opacity-50"
              >
                {creating ? '...' : (isHe ? 'צור' : 'Create')}
              </button>
              <button
                onClick={() => { setShowForm(false); setNewTitle(''); setNewSkill(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-stripe-gray hover:text-stripe-dark hover:border-gray-300 transition-all"
              >
                {isHe ? 'ביטול' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tasks table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-32 animate-pulse bg-gray-50" />
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-stripe-gray/50 text-sm">
            {isHe ? 'אין משימות' : 'No tasks found'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stripe-gray/60 border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'כותרת' : 'Title'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'סטטוס' : 'Status'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'כישור' : 'Skill'}</th>
                  <th className="text-left px-5 py-3 font-medium">ICE</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'נוצר' : 'Created'}</th>
                  <th className="text-right px-5 py-3 font-medium">{isHe ? 'פעולות' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-stripe-light transition-colors">
                    <td className="px-5 py-3 text-stripe-dark font-medium">{task.title}</td>
                    <td className="px-5 py-3"><StatusBadge status={task.status} /></td>
                    <td className="px-5 py-3 text-stripe-gray font-mono">{task.skill ?? '—'}</td>
                    <td className="px-5 py-3 text-stripe-gray">{task.iceScore ?? '—'}</td>
                    <td className="px-5 py-3 text-stripe-gray/60 whitespace-nowrap">
                      {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {task.status === 'PENDING' && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => updateTaskStatus(task.id, 'IN_PROGRESS')}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-[10px] font-medium border border-emerald-200"
                          >
                            <Play size={10} /> {isHe ? 'התחל' : 'Start'}
                          </button>
                          <button
                            onClick={() => updateTaskStatus(task.id, 'FAILED')}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-[10px] font-medium border border-red-200"
                          >
                            <XCircle size={10} /> {isHe ? 'דחה' : 'Reject'}
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
    </div>
  );
}

// ─── Automations Tab ──────────────────────────────────────

function AutomationsTab({ slug, isHe }: { slug: string; isHe: boolean }) {
  const [automations, setAutomations] = useState<AgentAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [newCron, setNewCron] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get<AgentAutomation[]>(`/api/admin/agents/${slug}/automations`)
      .then(setAutomations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await api.patch(`/api/admin/agents/${slug}/automations/${id}`, { enabled: !enabled });
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
      );
    } catch {
      // ignore
    }
  };

  const createAutomation = async () => {
    if (!newName.trim() || !newSkill.trim() || !newCron.trim()) return;
    setCreating(true);
    try {
      const automation = await api.post<AgentAutomation>(`/api/admin/agents/${slug}/automations`, {
        name: newName.trim(),
        skill: newSkill.trim(),
        cron: newCron.trim(),
      });
      setAutomations((prev) => [automation, ...prev]);
      setNewName('');
      setNewSkill('');
      setNewCron('');
      setShowForm(false);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    // Fetch recent runs if not already loaded
    const auto = automations.find((a) => a.id === id);
    if (auto && !auto.recentRuns) {
      try {
        const runs = await api.get<AutomationRun[]>(`/api/admin/agents/${slug}/automations/${id}/runs?limit=5`);
        setAutomations((prev) =>
          prev.map((a) => (a.id === id ? { ...a, recentRuns: runs } : a))
        );
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-stripe-purple text-white hover:bg-stripe-purple/90 transition-all"
        >
          <Plus size={13} />
          {isHe ? 'אוטומציה חדשה' : 'New Automation'}
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder={isHe ? 'שם...' : 'Name...'}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
            />
            <input
              type="text"
              placeholder={isHe ? 'כישור' : 'Skill'}
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              className="sm:w-36 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
            />
            <input
              type="text"
              placeholder="Cron (e.g. 0 9 * * *)"
              value={newCron}
              onChange={(e) => setNewCron(e.target.value)}
              className="sm:w-44 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
            />
            <div className="flex gap-2">
              <button
                onClick={createAutomation}
                disabled={creating || !newName.trim() || !newSkill.trim() || !newCron.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-stripe-purple text-white hover:bg-stripe-purple/90 transition-all disabled:opacity-50"
              >
                {creating ? '...' : (isHe ? 'צור' : 'Create')}
              </button>
              <button
                onClick={() => { setShowForm(false); setNewName(''); setNewSkill(''); setNewCron(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-stripe-gray hover:text-stripe-dark hover:border-gray-300 transition-all"
              >
                {isHe ? 'ביטול' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automations table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-32 animate-pulse bg-gray-50" />
        ) : automations.length === 0 ? (
          <div className="text-center py-12 text-stripe-gray/50 text-sm">
            {isHe ? 'אין אוטומציות' : 'No automations configured'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stripe-gray/60 border-b border-gray-100 bg-gray-50/50">
                  <th className="w-8 px-3 py-3" />
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'שם' : 'Name'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'כישור' : 'Skill'}</th>
                  <th className="text-left px-5 py-3 font-medium">Cron</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'סטטוס' : 'Status'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'ריצה אחרונה' : 'Last Run'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'ריצה הבאה' : 'Next Run'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {automations.map((auto) => (
                  <>
                    <tr key={auto.id} className="hover:bg-stripe-light transition-colors cursor-pointer" onClick={() => toggleExpand(auto.id)}>
                      <td className="px-3 py-3">
                        {expanded === auto.id ? <ChevronDown size={14} className="text-stripe-gray" /> : <ChevronRight size={14} className="text-stripe-gray" />}
                      </td>
                      <td className="px-5 py-3 text-stripe-dark font-medium">{auto.name}</td>
                      <td className="px-5 py-3 text-stripe-gray font-mono">{auto.skill}</td>
                      <td className="px-5 py-3 text-stripe-gray font-mono">{auto.cron}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleEnabled(auto.id, auto.enabled); }}
                          className={`relative w-9 h-5 rounded-full transition-colors ${auto.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                              auto.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-5 py-3 text-stripe-gray/60 whitespace-nowrap">
                        {auto.lastRunAt
                          ? new Date(auto.lastRunAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-stripe-gray/60 whitespace-nowrap">
                        {auto.nextRunAt
                          ? new Date(auto.nextRunAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                    </tr>
                    {/* Expanded row: recent runs */}
                    {expanded === auto.id && (
                      <tr key={`${auto.id}-runs`}>
                        <td colSpan={7} className="bg-gray-50/80 px-10 py-3">
                          {!auto.recentRuns ? (
                            <div className="h-12 animate-pulse bg-gray-100 rounded" />
                          ) : auto.recentRuns.length === 0 ? (
                            <p className="text-stripe-gray/50 text-xs">{isHe ? 'אין ריצות אחרונות' : 'No recent runs'}</p>
                          ) : (
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="text-stripe-gray/50">
                                  <th className="text-left pb-1 font-medium">{isHe ? 'סטטוס' : 'Status'}</th>
                                  <th className="text-left pb-1 font-medium">{isHe ? 'משך' : 'Duration'}</th>
                                  <th className="text-left pb-1 font-medium">{isHe ? 'עלות' : 'Cost'}</th>
                                  <th className="text-left pb-1 font-medium">{isHe ? 'סיכום' : 'Summary'}</th>
                                  <th className="text-left pb-1 font-medium">{isHe ? 'תאריך' : 'Date'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {auto.recentRuns.map((run) => (
                                  <tr key={run.id}>
                                    <td className="py-1.5 pr-3"><StatusBadge status={run.status} /></td>
                                    <td className="py-1.5 pr-3 text-stripe-gray">
                                      {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                                    </td>
                                    <td className="py-1.5 pr-3 text-stripe-gray">
                                      {run.cost != null ? `$${run.cost.toFixed(4)}` : '—'}
                                    </td>
                                    <td className="py-1.5 pr-3 text-stripe-gray truncate max-w-xs">{run.summary ?? '—'}</td>
                                    <td className="py-1.5 text-stripe-gray/60 whitespace-nowrap">
                                      {new Date(run.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Logs Tab ─────────────────────────────────────────────

function LogsTab({ slug, isHe }: { slug: string; isHe: boolean }) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 25;

  const fetchLogs = useCallback(async (offset = 0) => {
    const isMore = offset > 0;
    if (isMore) setLoadingMore(true); else setLoading(true);

    try {
      const data = await api.get<AgentLog[]>(`/api/admin/agents/${slug}/logs?limit=${PAGE_SIZE}&offset=${offset}`);
      if (isMore) {
        setLogs((prev) => [...prev, ...data]);
      } else {
        setLogs(data);
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [slug]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-48 animate-pulse bg-gray-50" />
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-stripe-gray/50 text-sm">
            {isHe ? 'אין לוגים' : 'No logs found'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stripe-gray/60 border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'זמן' : 'Timestamp'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'כישור' : 'Skill'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'פעולה' : 'Action'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'סטטוס' : 'Status'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'טוקנים' : 'Tokens'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'עלות' : 'Cost'}</th>
                  <th className="text-left px-5 py-3 font-medium">{isHe ? 'משך' : 'Duration'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-stripe-light transition-colors">
                    <td className="px-5 py-3 text-stripe-gray/60 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3 text-stripe-gray font-mono">{log.skill ?? '—'}</td>
                    <td className="px-5 py-3 text-stripe-dark">{log.action}</td>
                    <td className="px-5 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-5 py-3 text-stripe-gray">
                      {log.tokensUsed != null ? log.tokensUsed.toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-stripe-gray">
                      {log.cost != null ? `$${log.cost.toFixed(4)}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-stripe-gray">
                      {log.durationMs != null ? `${(log.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Load more */}
      {hasMore && logs.length > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchLogs(logs.length)}
            disabled={loadingMore}
            className="px-4 py-2 rounded-lg text-xs font-medium border border-gray-200 text-stripe-gray hover:text-stripe-dark hover:border-gray-300 transition-all disabled:opacity-50"
          >
            {loadingMore
              ? (isHe ? 'טוען...' : 'Loading...')
              : (isHe ? 'טען עוד' : 'Load More')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────

function SettingsTab({
  agent, slug, isHe, onUpdate,
}: {
  agent: AgentDetail;
  slug: string;
  isHe: boolean;
  onUpdate: (agent: AgentDetail) => void;
}) {
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? '');
  const [model, setModel] = useState(agent.model ?? '');
  const [description, setDescription] = useState(agent.description ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.patch<AgentDetail>(`/api/admin/agents/${slug}`, {
        systemPrompt: systemPrompt || null,
        model: model || null,
        description: description || null,
      });
      onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* System Prompt */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
        <label className="block text-sm font-semibold text-stripe-dark mb-2">
          {isHe ? 'הנחיית מערכת' : 'System Prompt'}
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={8}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
          placeholder={isHe ? 'הנחיות לסוכן...' : 'Agent system instructions...'}
        />
      </div>

      {/* Model */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
        <label className="block text-sm font-semibold text-stripe-dark mb-2">
          {isHe ? 'מודל' : 'Model'}
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
          placeholder="e.g. gpt-4o-mini"
        />
      </div>

      {/* Description */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
        <label className="block text-sm font-semibold text-stripe-dark mb-2">
          {isHe ? 'תיאור' : 'Description'}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple"
          placeholder={isHe ? 'תיאור הסוכן...' : 'Agent description...'}
        />
      </div>

      {/* Skills (display only) */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
        <label className="block text-sm font-semibold text-stripe-dark mb-2">
          {isHe ? 'כישורים' : 'Skills'}
        </label>
        {agent.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {agent.skills.map((skill) => (
              <span
                key={skill}
                className="px-3 py-1 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-stripe-gray"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stripe-gray/50">{isHe ? 'אין כישורים' : 'No skills configured'}</p>
        )}
      </div>

      {/* Integrations (display only) */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
        <label className="block text-sm font-semibold text-stripe-dark mb-2">
          {isHe ? 'אינטגרציות' : 'Integrations'}
        </label>
        {agent.integrations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {agent.integrations.map((integration) => (
              <span
                key={integration}
                className="px-3 py-1 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-stripe-gray"
              >
                {integration}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stripe-gray/50">{isHe ? 'אין אינטגרציות' : 'No integrations configured'}</p>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-stripe-purple text-white hover:bg-stripe-purple/90 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isHe ? 'שמור שינויים' : 'Save Changes'}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
            <CheckCircle size={14} />
            {isHe ? 'נשמר!' : 'Saved!'}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Shared UI Components ─────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${style}`}>
      {status}
    </span>
  );
}

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: number | string;
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
