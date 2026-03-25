import { useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, Inbox, LogOut, Menu, X, BarChart3 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import NexusLogo from '../NexusLogo';

interface NavItem {
  to: string;
  icon: React.ElementType;
  labelEn: string;
  labelHe: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '',               icon: LayoutDashboard, labelEn: 'Dashboard',     labelHe: 'לוח בקרה' },
  { to: '/agents',        icon: Bot,             labelEn: 'Agents',        labelHe: 'סוכנים' },
  { to: '/inbox',         icon: Inbox,           labelEn: 'Inbox',         labelHe: "צ'אטים" },
  { to: '/seo-analytics', icon: BarChart3,       labelEn: 'SEO Analytics', labelHe: 'אנליטיקס SEO' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isHe = pathname.startsWith('/he/') || pathname === '/he';
  const basePath = isHe ? '/he/admin' : '/admin';
  const dir = isHe ? 'rtl' : 'ltr';

  const handleLogout = async () => {
    await logout();
    window.location.href = isHe ? '/he/login' : '/login';
  };

  const isActive = (itemTo: string) => {
    const fullPath = basePath + itemTo;
    if (itemTo === '') {
      return pathname === basePath || pathname === basePath + '/';
    }
    return pathname.startsWith(fullPath);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-stripe-light" dir={dir}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 z-40
          ${isHe ? 'right-0' : 'left-0'}
          w-60 lg:w-60
          bg-gray-900 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : (isHe ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0')}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <Link to={basePath} dir="ltr">
            <NexusLogo height={32} variant="white" />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={basePath + item.to}
                end={item.to === ''}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${active
                    ? 'bg-gray-800 text-white border-stripe-purple ' + (isHe ? 'border-r-2' : 'border-l-2')
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }
                `}
              >
                <Icon size={18} />
                <span>{isHe ? item.labelHe : item.labelEn}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User info + Logout */}
        <div className="px-3 py-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-stripe-purple/20 flex items-center justify-center text-stripe-purple text-xs font-bold">
              {user?.fullName?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.fullName ?? 'Admin'}</div>
              <div className="text-xs text-gray-500 truncate">{user?.email ?? ''}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 transition-all"
          >
            <LogOut size={18} />
            <span>{isHe ? 'התנתק' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-all"
          >
            <Menu size={18} className="text-stripe-gray" />
          </button>
          <Link to={basePath} dir="ltr">
            <NexusLogo height={28} variant="black" page="auth" />
          </Link>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
