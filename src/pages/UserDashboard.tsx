import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { WALLET } from '../lib/analyticsEvents';
import {
  ShoppingBag, CreditCard, MessageSquare, TrendingUp,
  LogOut, ChevronRight, Clock, CheckCircle, XCircle, RefreshCw, Mail,
  Building2, UserCircle,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? '';

// ─── Types ────────────────────────────────────────────────

interface OrgMembership {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  org: {
    id: string;
    slug: string;
    name: string;
    logoUrl?: string;
    primaryColor?: string;
    _count?: { members: number };
  };
}

const ORG_ROLE_LABELS: Record<string, string> = {
  OWNER:  'Owner',
  ADMIN:  'Admin',
  MEMBER: 'Member',
};

const ORG_ROLE_COLORS: Record<string, string> = {
  OWNER:  'bg-teal-500/20 text-teal-300',
  ADMIN:  'bg-blue-500/20 text-blue-300',
  MEMBER: 'bg-white/10 text-white/50',
};

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Order {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  createdAt: string;
  items: OrderItem[];
}

interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pages: number;
}

interface Stats {
  totalOrders: number;
  succeededOrders: number;
  totalSpent: number;
  chatSessions: number;
  recentActivity: Array<{
    id: string;
    eventName: string;
    channel: string;
    properties: Record<string, unknown>;
    receivedAt: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────

function formatMoney(amountCents: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const map: Record<Order['status'], { label: string; cls: string; icon: React.ElementType }> = {
    PENDING:    { label: 'Pending',    cls: 'text-yellow-400 bg-yellow-400/10', icon: Clock },
    PROCESSING: { label: 'Processing', cls: 'text-blue-400 bg-blue-400/10',    icon: RefreshCw },
    SUCCEEDED:  { label: 'Paid',       cls: 'text-green-400 bg-green-400/10',  icon: CheckCircle },
    FAILED:     { label: 'Failed',     cls: 'text-red-400 bg-red-400/10',      icon: XCircle },
    REFUNDED:   { label: 'Refunded',   cls: 'text-teal-400 bg-teal-400/10', icon: RefreshCw },
  };
  const { label, cls, icon: Icon } = map[status] ?? map.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}

function ActivityLabel(eventName: string): string {
  const map: Record<string, string> = {
    Payment_Completed: 'Payment processed',
    Payment_Failed:    'Payment failed',
    Payment_Refunded:  'Payment refunded',
    Chat_Session_Started: 'Started a support chat',
    User_Logged_In:    'Signed in',
    User_Signed_Up:    'Account created',
    Wallet_Dashboard_Viewed: 'Viewed dashboard',
  };
  return map[eventName] ?? eventName.replace(/_/g, ' ');
}

// ─── Main Page ────────────────────────────────────────────

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { track } = useAnalytics();

  const [stats, setStats] = useState<Stats | null>(null);
  const [ordersData, setOrdersData] = useState<OrdersResponse | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);

  useEffect(() => {
    // Track dashboard view
    track(WALLET.DASHBOARD_VIEWED, 'WALLET', { section: 'overview' });

    void (async () => {
      try {
        const [s, o] = await Promise.all([
          api.get<Stats>('/api/user/stats'),
          api.get<OrdersResponse>('/api/user/orders?limit=20'),
        ]);
        setStats(s);
        setOrdersData(o);
      } catch (e: any) {
        setError(e?.error ?? 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.get<OrgMembership[]>('/api/user/orgs')
      .then((data) => setOrgs(data))
      .catch(() => {})
      .finally(() => setOrgsLoading(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleResendVerification = async () => {
    setResendState('sending');
    try {
      await api.post('/api/auth/resend-verification');
      setResendState('sent');
    } catch {
      setResendState('idle');
    }
  };

  const toggleOrder = (id: string) => {
    const next = expandedOrder === id ? null : id;
    setExpandedOrder(next);
    if (next) {
      track(WALLET.TRANSACTION_VIEWED, 'WALLET', { transaction_id: id });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-gray-950/90 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-sky-500 rounded-lg" />
          <span className="font-semibold">My Account</span>
        </div>
        <div className="flex items-center gap-3">
          {user?.avatarUrl && (
            <img src={user.avatarUrl} alt={user.fullName} className="w-8 h-8 rounded-full object-cover" />
          )}
          <span className="text-sm text-white/60 hidden sm:block">{user?.fullName}</span>
          <Link
            to="/profile"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
            title="My profile"
          >
            <UserCircle size={16} />
          </Link>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">Hey, {user?.fullName?.split(' ')[0]} 👋</h1>
          <p className="text-white/40 text-sm mt-1">{user?.email}</p>
        </div>

        {/* Email verification banner */}
        {user && !user.emailVerified && (
          <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
            <Mail size={18} className="text-yellow-400 shrink-0" />
            <div className="flex-1 text-sm text-yellow-200">
              Please verify your email address to access all features.
            </div>
            <button
              onClick={handleResendVerification}
              disabled={resendState !== 'idle'}
              className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 disabled:opacity-50 shrink-0 transition-colors"
            >
              {resendState === 'sending' ? 'Sending…' : resendState === 'sent' ? 'Sent ✓' : 'Resend email'}
            </button>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Orders',    value: stats?.totalOrders ?? 0,     icon: ShoppingBag, color: '#0D9488' },
            { label: 'Total Spent',     value: `₪${(stats?.totalSpent ?? 0).toFixed(2)}`, icon: CreditCard, color: '#10b981' },
            { label: 'Successful Pays', value: stats?.succeededOrders ?? 0,  icon: TrendingUp, color: '#06b6d4' },
            { label: 'Support Chats',   value: stats?.chatSessions ?? 0,     icon: MessageSquare, color: '#f59e0b' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/50">{label}</span>
                <Icon size={14} style={{ color }} />
              </div>
              <div className="text-2xl font-bold text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* Orders */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
            <ShoppingBag size={16} className="text-teal-400" />
            <h2 className="font-semibold text-sm">Orders</h2>
            {ordersData && (
              <span className="ml-auto text-xs text-white/30">{ordersData.total} total</span>
            )}
          </div>

          {!ordersData?.orders.length ? (
            <div className="px-6 py-12 text-center text-white/20 text-sm">No orders yet</div>
          ) : (
            <div className="divide-y divide-white/5">
              {ordersData.orders.map(order => (
                <div key={order.id}>
                  {/* Order row */}
                  <button
                    className="w-full px-6 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                    onClick={() => toggleOrder(order.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-white/40">#{order.id.slice(-8).toUpperCase()}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="text-xs text-white/40 mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                        {' · '}
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatMoney(order.totalAmount, order.currency)}</div>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`text-white/30 transition-transform ${expandedOrder === order.id ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {/* Expanded items */}
                  {expandedOrder === order.id && (
                    <div className="px-6 pb-4 bg-white/[0.02]">
                      <div className="border border-white/10 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-white/30 border-b border-white/10">
                              <th className="text-left px-4 py-2 font-medium">Item</th>
                              <th className="text-right px-4 py-2 font-medium">Qty</th>
                              <th className="text-right px-4 py-2 font-medium">Unit</th>
                              <th className="text-right px-4 py-2 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {order.items.map(item => (
                              <tr key={item.id}>
                                <td className="px-4 py-2 text-white/70">{item.productName}</td>
                                <td className="px-4 py-2 text-right text-white/50">{item.quantity}</td>
                                <td className="px-4 py-2 text-right text-white/50">
                                  {formatMoney(item.unitPrice, order.currency)}
                                </td>
                                <td className="px-4 py-2 text-right font-medium">
                                  {formatMoney(item.totalPrice, order.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        {stats?.recentActivity && stats.recentActivity.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
              <Clock size={16} className="text-cyan-400" />
              <h2 className="font-semibold text-sm">Recent Activity</h2>
            </div>
            <div className="divide-y divide-white/5">
              {stats.recentActivity.map(ev => (
                <div key={ev.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-white/20 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/80">{ActivityLabel(ev.eventName)}</div>
                  </div>
                  <div className="text-xs text-white/30 shrink-0">
                    {new Date(ev.receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* My Organizations */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
            <Building2 size={16} className="text-teal-400" />
            <h2 className="font-semibold text-sm">My Organizations</h2>
            {!orgsLoading && orgs.length > 0 && (
              <span className="ml-auto text-xs text-white/30">{orgs.length}</span>
            )}
          </div>

          {orgsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                <Building2 size={18} className="text-white/20" />
              </div>
              <p className="text-sm text-white/30 mb-1">Not a member of any organization</p>
              <p className="text-xs text-white/20">Use an invite link to join an organization</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {orgs.map((m) => (
                <div key={m.org.id} className="px-6 py-4 flex items-center gap-4">
                  {/* Org avatar */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: m.org.primaryColor ?? '#6366f1' }}
                  >
                    {m.org.logoUrl ? (
                      <img src={m.org.logoUrl} alt="" className="w-9 h-9 object-cover" />
                    ) : (
                      m.org.name.charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* Org info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{m.org.name}</p>
                    {m.org._count && (
                      <p className="text-xs text-white/40">{m.org._count.members} members</p>
                    )}
                  </div>

                  {/* Role badge */}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${ORG_ROLE_COLORS[m.role] ?? 'bg-white/10 text-white/50'}`}>
                    {ORG_ROLE_LABELS[m.role] ?? m.role}
                  </span>

                  {/* Manage link */}
                  <a
                    href={`${DASHBOARD_URL}/organizations/${m.org.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-teal-400 hover:text-teal-300 transition-colors flex-shrink-0"
                  >
                    נהל →
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
