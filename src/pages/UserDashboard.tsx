import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { WALLET } from '../lib/analyticsEvents';
import {
  ShoppingBag, CreditCard, MessageSquare, TrendingUp,
  LogOut, ChevronRight, Clock, CheckCircle, XCircle, RefreshCw, Mail,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import NexusLogo from '../components/NexusLogo';

// ─── Types ────────────────────────────────────────────────

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
    PENDING:    { label: 'Pending',    cls: 'text-yellow-600 bg-yellow-50 border border-yellow-200',  icon: Clock },
    PROCESSING: { label: 'Processing', cls: 'text-blue-600 bg-blue-50 border border-blue-200',        icon: RefreshCw },
    SUCCEEDED:  { label: 'Paid',       cls: 'text-emerald-600 bg-emerald-50 border border-emerald-200', icon: CheckCircle },
    FAILED:     { label: 'Failed',     cls: 'text-red-600 bg-red-50 border border-red-200',            icon: XCircle },
    REFUNDED:   { label: 'Refunded',   cls: 'text-purple-600 bg-purple-50 border border-purple-200',  icon: RefreshCw },
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

  useEffect(() => {
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
      <div className="min-h-screen bg-stripe-light flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-gray-200 border-t-stripe-purple animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stripe-light" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* Header — matches signup/login top bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" dir="ltr">
            <NexusLogo height={40} variant="black" page="auth" />
          </Link>
          <div className="flex items-center gap-3">
            {user?.avatarUrl && (
              <img src={user.avatarUrl} alt={user.fullName} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
            )}
            <span className="text-sm font-medium text-stripe-dark hidden sm:block">{user?.fullName}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-medium text-stripe-gray hover:text-stripe-dark px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all"
              title="Sign out"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-stripe-dark">Hey, {user?.fullName?.split(' ')[0]} 👋</h1>
          <p className="text-stripe-gray text-sm mt-1">{user?.email}</p>
        </div>

        {/* Email verification banner */}
        {user && !user.emailVerified && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Mail size={16} className="text-amber-500 shrink-0" />
            <div className="flex-1 text-sm text-amber-800">
              Please verify your email address to access all features.
            </div>
            <button
              onClick={handleResendVerification}
              disabled={resendState !== 'idle'}
              className="text-xs font-semibold text-stripe-purple hover:text-stripe-purple/80 disabled:opacity-50 shrink-0 transition-colors"
            >
              {resendState === 'sending' ? 'Sending…' : resendState === 'sent' ? 'Sent ✓' : 'Resend email'}
            </button>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Orders',    value: stats?.totalOrders ?? 0,                           icon: ShoppingBag,  accent: '#635bff' },
            { label: 'Total Spent',     value: `₪${(stats?.totalSpent ?? 0).toFixed(2)}`,         icon: CreditCard,   accent: '#10b981' },
            { label: 'Successful Pays', value: stats?.succeededOrders ?? 0,                       icon: TrendingUp,   accent: '#0ea5e9' },
            { label: 'Support Chats',   value: stats?.chatSessions ?? 0,                          icon: MessageSquare, accent: '#f59e0b' },
          ].map(({ label, value, icon: Icon, accent }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-stripe-gray">{label}</span>
                <Icon size={14} style={{ color: accent }} />
              </div>
              <div className="text-2xl font-bold text-stripe-dark">{value}</div>
            </div>
          ))}
        </div>

        {/* Orders */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <ShoppingBag size={15} className="text-stripe-purple" />
            <h2 className="font-semibold text-sm text-stripe-dark">Orders</h2>
            {ordersData && (
              <span className="ml-auto text-xs text-stripe-gray">{ordersData.total} total</span>
            )}
          </div>

          {!ordersData?.orders.length ? (
            <div className="px-6 py-12 text-center text-stripe-gray/60 text-sm">No orders yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ordersData.orders.map(order => (
                <div key={order.id}>
                  <button
                    className="w-full px-6 py-4 flex items-center gap-4 hover:bg-stripe-light transition-colors text-left"
                    onClick={() => toggleOrder(order.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-stripe-gray/60">#{order.id.slice(-8).toUpperCase()}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="text-xs text-stripe-gray/60 mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                        {' · '}
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-stripe-dark text-sm">{formatMoney(order.totalAmount, order.currency)}</div>
                    </div>
                    <ChevronRight
                      size={15}
                      className={`text-stripe-gray/40 transition-transform shrink-0 ${expandedOrder === order.id ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {expandedOrder === order.id && (
                    <div className="px-6 pb-4 bg-stripe-light/50">
                      <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-stripe-gray/60 border-b border-gray-100 bg-gray-50/60">
                              <th className="text-left px-4 py-2 font-medium">Item</th>
                              <th className="text-right px-4 py-2 font-medium">Qty</th>
                              <th className="text-right px-4 py-2 font-medium">Unit</th>
                              <th className="text-right px-4 py-2 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {order.items.map(item => (
                              <tr key={item.id}>
                                <td className="px-4 py-2 text-stripe-dark">{item.productName}</td>
                                <td className="px-4 py-2 text-right text-stripe-gray">{item.quantity}</td>
                                <td className="px-4 py-2 text-right text-stripe-gray">
                                  {formatMoney(item.unitPrice, order.currency)}
                                </td>
                                <td className="px-4 py-2 text-right font-semibold text-stripe-dark">
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
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Clock size={15} className="text-stripe-purple" />
              <h2 className="font-semibold text-sm text-stripe-dark">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {stats.recentActivity.map(ev => (
                <div key={ev.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-stripe-purple/30 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stripe-dark">{ActivityLabel(ev.eventName)}</div>
                  </div>
                  <div className="text-xs text-stripe-gray/60 shrink-0">
                    {new Date(ev.receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
