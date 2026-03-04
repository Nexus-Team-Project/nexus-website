import nexusBlackLogo from '../../assets/logos/nexus-logo-black.png';
import { useLanguage } from '../../i18n/LanguageContext';

// ── Minimal SVG icon set (approximates Material Icons) ────────────────────────
function Icon({ d, size = 18, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className="shrink-0">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  person:    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  bell:      'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  headset:   'M12 1C5.925 1 1 5.925 1 12v4.5c0 1.105.895 2 2 2h1c.552 0 1-.448 1-1v-5c0-.552-.448-1-1-1H3v-1c0-4.963 4.037-9 9-9s9 4.037 9 9v1h-1c-.552 0-1 .448-1 1v5c0 .552.448 1 1 1h1c1.105 0 2-.895 2-2V12C23 5.925 18.075 1 12 1z',
  group:     'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  diamond:   'M19 3H5L2 9l10 12L22 9l-3-6zm-9.83 6l1.28-3h3.1l1.28 3H9.17zm5.36 2l-2.53 6.03L9.47 11h5.06zM7.57 9H4.98l1.5-3h2.36L7.57 9zm9.46 0l-1.28-3h2.36l1.5 3h-2.58z',
  web:       'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12z',
  expand:    'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z',
  chevron:   'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  dashboard: 'M3 3h8v8H3zm0 10h8v8H3zm10-10h8v8h-8zm0 10h8v8h-8z',
  people:    'M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  gift:      'M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.53 15.47 0 12 0S6 2.53 6 4.64c0 .48.1.92.18 1.36H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8-3.18c1.16 0 2.18.94 2.18 1.82 0 .88-1.02 1.82-2.18 1.82s-2.18-.94-2.18-1.82c0-.88 1.02-1.82 2.18-1.82zM11 18H7v-7l4 4v3zm6 0h-4v-3l4-4v7z',
  tag:       'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
  article:   'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  chart:     'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
  campaign:  'M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z',
  sync:      'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
  chat:      'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  code:      'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  settings:  'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  logout:    'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  search:    'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
};

// ── Bilingual content ─────────────────────────────────────────────────────────
const CONTENT = {
  he: {
    upgrade:    'שדרג',
    search:     'חפש...',
    navItems: [
      { icon: 'dashboard' as const,  label: 'Dashboard',                     active: true },
      { icon: 'people'    as const,  label: 'Users' },
      { icon: 'gift'      as const,  label: 'נקודות ומתנות' },
      { icon: 'tag'       as const,  label: 'הטבות ושיתופי פעולה' },
      { icon: 'article'   as const,  label: 'Content' },
      { icon: 'chart'     as const,  label: 'דוחות' },
      { icon: 'campaign'  as const,  label: 'שיווק' },
      { icon: 'sync'      as const,  label: 'עדכונים' },
      { icon: 'chat'      as const,  label: "צ'אט" },
      { icon: 'code'      as const,  label: 'Developer Tools' },
      { icon: 'settings'  as const,  label: 'Settings' },
    ],
    upgradeTitle:  'שדרג לפרימיום',
    upgradeDesc:   'קבל גישה לכל התכונות',
    upgradeBtn:    'שדרג עכשיו',
    userName:      'דניאל רביב',
    greeting:      'אחר צהריים טובים, Admin',
    greetingSub:   'שמחים לראות אותך שוב',
    stats: [
      { value: '156', label: 'Total Users'    },
      { value: '142', label: 'Active Users'   },
      { value: '89',  label: 'Total Content'  },
      { value: '72',  label: 'Published'      },
    ],
    recentUsersTitle:   'Recent Users',
    recentContentTitle: 'Recent Content',
    active: 'פעיל',
    published: 'פורסם',
    draft: 'טיוטה',
  },
  en: {
    upgrade:    'Upgrade',
    search:     'Search...',
    navItems: [
      { icon: 'dashboard' as const,  label: 'Dashboard',             active: true },
      { icon: 'people'    as const,  label: 'Users' },
      { icon: 'gift'      as const,  label: 'Points & Gifts' },
      { icon: 'tag'       as const,  label: 'Benefits & Partnerships' },
      { icon: 'article'   as const,  label: 'Content' },
      { icon: 'chart'     as const,  label: 'Reports' },
      { icon: 'campaign'  as const,  label: 'Marketing' },
      { icon: 'sync'      as const,  label: 'Updates' },
      { icon: 'chat'      as const,  label: 'Chat' },
      { icon: 'code'      as const,  label: 'Developer Tools' },
      { icon: 'settings'  as const,  label: 'Settings' },
    ],
    upgradeTitle:  'Upgrade to Premium',
    upgradeDesc:   'Unlock all features',
    upgradeBtn:    'Upgrade Now',
    userName:      'Daniel Raviv',
    greeting:      'Good afternoon, Admin',
    greetingSub:   'Good to see you again',
    stats: [
      { value: '156', label: 'Total Users'   },
      { value: '142', label: 'Active Users'  },
      { value: '89',  label: 'Total Content' },
      { value: '72',  label: 'Published'     },
    ],
    recentUsersTitle:   'Recent Users',
    recentContentTitle: 'Recent Content',
    active: 'active',
    published: 'published',
    draft: 'draft',
  },
};

const RECENT_USERS = [
  { initial: 'J', name: 'John Smith',    email: 'john@example.com'  },
  { initial: 'S', name: 'Sarah Johnson', email: 'sarah@example.com' },
  { initial: 'M', name: 'Mike Wilson',   email: 'mike@example.com'  },
];

const RECENT_CONTENT = [
  { emoji: '📄', title: 'Welcome to Our Platform', author: 'John Smith',    status: 'published' as const },
  { emoji: '📝', title: 'Getting Started Guide',    author: 'Sarah Johnson', status: 'published' as const },
  { emoji: '📝', title: 'Product Announcement',     author: 'John Smith',    status: 'draft'     as const },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardMock() {
  const { language, direction } = useLanguage();
  const c = CONTENT[language === 'he' ? 'he' : 'en'];

  return (
    // direction-aware: sidebar on RIGHT in RTL (Hebrew), on LEFT in LTR (English)
    <div
      dir={direction}
      className="absolute inset-0 flex flex-col overflow-hidden select-none pointer-events-none"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 h-[73px] flex items-center px-6 shrink-0 z-10">

        {/* Start side: user controls */}
        <div className="flex items-center gap-3">
          {/* Avatar — border-e separates it from the other controls */}
          <div className="flex items-center gap-2 pe-4 border-e border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
              <Icon d={ICONS.person} size={16} color="#94a3b8" />
            </div>
          </div>
          {/* Bell with red dot */}
          <div className="relative p-2">
            <Icon d={ICONS.bell} size={20} color="#64748b" />
            <span className="absolute top-2 end-2 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
          </div>
          <div className="p-2"><Icon d={ICONS.headset} size={20} color="#64748b" /></div>
          <div className="p-2"><Icon d={ICONS.group}   size={20} color="#64748b" /></div>
          {/* Upgrade */}
          <div className="flex items-center gap-1 text-[13px] font-semibold text-[#0066cc]">
            <Icon d={ICONS.diamond} size={16} color="#0066cc" />
            {c.upgrade}
          </div>
          {/* Language badge */}
          <div className="px-2 py-1 text-[12px] text-slate-500 border border-slate-200 rounded-md">
            EN / HE
          </div>
        </div>

        {/* End side (ms-auto): search + logo — flips automatically with dir */}
        <div className="flex items-center gap-4 ms-auto">
          <div className="w-52 h-8 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-2 px-3">
            <Icon d={ICONS.search} size={14} color="#94a3b8" />
            <span className="text-[12px] text-slate-400">{c.search}</span>
          </div>
          <img src={nexusBlackLogo} alt="Nexus" className="h-9 w-auto object-contain" />
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar (first in DOM → RIGHT in RTL, LEFT in LTR) ──────────── */}
        <aside className="w-64 bg-white border-e border-slate-200 shrink-0 flex flex-col min-h-0">

          {/* Project Switcher */}
          <div className="px-3 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 rounded-xl">
              <Icon d={ICONS.web} size={18} color="#0066cc" />
              <span className="text-[13px] font-medium text-slate-900 flex-1 truncate">Nexus-Online</span>
              <Icon d={ICONS.expand} size={18} color="#64748b" />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-hidden">
            {c.navItems.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] ${
                  item.active
                    ? 'bg-slate-200/70 text-[#323338] font-medium'
                    : 'text-[#676879]'
                }`}
              >
                <Icon d={ICONS[item.icon]} size={18} color={item.active ? '#323338' : '#676879'} />
                <span className="truncate">{item.label}</span>
                {item.icon === 'code' && <Icon d={ICONS.chevron} size={16} color="#9ca3af" />}
              </div>
            ))}
          </nav>

          {/* Upgrade Banner */}
          <div className="px-3 pb-3">
            <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon d={ICONS.diamond} size={14} color="#0066cc" />
                <span className="text-[#0066cc] text-[11px] font-semibold">{c.upgradeTitle}</span>
              </div>
              <p className="text-[11px] text-slate-600 mb-2 leading-snug">{c.upgradeDesc}</p>
              <div className="w-full py-1.5 bg-[#0066cc] text-white text-[11px] font-semibold rounded text-center">
                {c.upgradeBtn}
              </div>
            </div>
          </div>

          {/* User Info + Logout */}
          <div className="p-3 border-t border-slate-200">
            <div className="flex items-center gap-2 px-2 py-2 rounded-md">
              <div className="w-7 h-7 bg-gradient-to-br from-[#0066cc] to-blue-400 rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0">
                {language === 'he' ? 'ד' : 'D'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate text-[#323338]">{c.userName}</p>
                <p className="text-[11px] text-[#676879] truncate">daniel@nexus.com</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-[#64748b]">
              <Icon d={ICONS.logout} size={18} color="#64748b" />
              <span className="text-[13px]">Logout</span>
            </div>
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <main className="flex-1 bg-[#f3f7fa] overflow-hidden p-6">

          {/* Greeting banner */}
          <div
            className="w-full mb-5 rounded-xl px-6 py-4 border-2 border-blue-200/50 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 60%, #dbeafe 100%)' }}
          >
            <div className="flex items-center justify-center gap-3">
              <h1 className="text-[1.35rem] font-bold text-blue-900 flex items-center gap-2">
                <span className="text-2xl">🌤️</span>
                <span>{c.greeting}</span>
              </h1>
            </div>
            <p className="text-center text-[13px] text-blue-700 font-medium mt-1">{c.greetingSub}</p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-5 mb-5">
            {c.stats.map((s) => (
              <div key={s.label} className="bg-white rounded-lg p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                <div className="text-[2rem] font-bold text-[#1f2937]">{s.value}</div>
                <div className="text-[#6b7280] text-[0.9rem] mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Dashboard grid */}
          <div className="grid grid-cols-2 gap-5">

            {/* Recent Users */}
            <div className="bg-white rounded-lg p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
              <h3 className="text-[1.1rem] font-medium text-[#1f2937] mb-4">{c.recentUsersTitle}</h3>
              <ul>
                {RECENT_USERS.map((u, i) => (
                  <li key={i} className="flex items-center gap-3 py-3 border-b border-[#e5e7eb] last:border-0">
                    <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                      {u.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[#1f2937] text-[14px]">{u.name}</div>
                      <div className="text-[#6b7280] text-[0.85rem]">{u.email}</div>
                    </div>
                    <span className="px-2 py-1 rounded text-[0.75rem] font-medium bg-emerald-100 text-emerald-800">
                      {c.active}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recent Content */}
            <div className="bg-white rounded-lg p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
              <h3 className="text-[1.1rem] font-medium text-[#1f2937] mb-4">{c.recentContentTitle}</h3>
              <ul>
                {RECENT_CONTENT.map((item, i) => (
                  <li key={i} className="flex items-center gap-3 py-3 border-b border-[#e5e7eb] last:border-0">
                    <div className="w-9 h-9 flex items-center justify-center text-xl shrink-0">{item.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[#1f2937] text-[14px] truncate">{item.title}</div>
                      <div className="text-[#6b7280] text-[0.85rem]">{item.author}</div>
                    </div>
                    <span className={`px-2 py-1 rounded text-[0.75rem] font-medium ${
                      item.status === 'published'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {item.status === 'published' ? c.published : c.draft}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
