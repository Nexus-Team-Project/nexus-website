import { useState, useEffect } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import { MARKETING } from '../lib/analyticsEvents';
import { ChevronDown, Menu, X, ArrowRight, CreditCard, Link as LinkIcon, Receipt, BarChart3, TrendingUp, Building2, Globe, Wallet, Network, FileText, HelpCircle, AppWindow, Users, Store, Code, Book, Terminal, Newspaper, GraduationCap, MessageSquare, Youtube, Gift, Heart, Layers, Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';
import NexusLogo from './NexusLogo';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { createPortal } from 'react-dom';

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:5174';

// Function to get nav items with translations
const getNavItems = (t: any, lang: 'en' | 'he') => [
  {
    label: t.navbar.products,
    megaMenu: {
      sections: [
        {
          title: t.navbar.revenue,
          items: [
            { name: t.navbar.loyaltyClub, desc: t.navbar.loyaltyClubDesc, icon: Users, href: lang === 'he' ? '/he/benefits' : '/benefits' },
            { name: t.navbar.loyaltyPartnerships, desc: t.navbar.loyaltyPartnershipsDesc, icon: Gift, href: lang === 'he' ? '/he/partners' : '/partners' },
            { name: t.navbar.giftsWelfare, desc: t.navbar.giftsWelfareDesc, icon: Heart, href: lang === 'he' ? '/he/welfare' : '/welfare' },
          ],
        },
        {
          title: t.navbar.payments,
          items: [
            { name: t.navbar.payments, desc: t.navbar.paymentsOnline, icon: CreditCard, href: lang === 'he' ? '/he/payments' : '/payments' },
            { name: t.navbar.paymentLinks, desc: t.navbar.paymentLinksDesc, icon: LinkIcon, href: lang === 'he' ? '/he/payments' : '/payments' },
            { name: t.navbar.cardIssuance, desc: t.navbar.cardIssuanceDesc, icon: Layers, href: lang === 'he' ? '/he/payments' : '/payments' },
            { name: t.navbar.businessLogic, desc: t.navbar.businessLogicDesc, icon: Cpu, href: lang === 'he' ? '/he/payments' : '/payments' },
          ],
        },
        {
          title: t.navbar.developers,
          items: [
            { name: t.navbar.documentation, desc: t.navbar.integrationGuides, icon: FileText, href: 'https://docs.nexus-payment.com/' },
            { name: t.navbar.changelog, desc: t.navbar.latestUpdates, icon: FileText, href: lang === 'he' ? '/he/changelog' : '/changelog' },
          ],
        },
      ],
      sidebar: {
        title: t.navbar.inTheNews,
        content: t.navbar.newsContent,
        cta: t.navbar.readArticle,
        link: 'https://www.globes.co.il/news/article.aspx?did=1001533300',
      },
    },
  },
  {
    label: t.navbar.solutions,
    disableMegaMenu: true,
    tooltip: t.navbar.comingSoon,
    megaMenu: {
      sections: [
        {
          title: t.navbar.byBusinessType,
          items: [
            { name: t.navbar.saas, desc: t.navbar.saasCompanies, icon: Code, comingSoon: true },
            { name: t.navbar.ecommerce, desc: t.navbar.ecommerceStores, icon: Store, comingSoon: true },
            { name: t.navbar.marketplaces, desc: t.navbar.multiVendorPlatforms, icon: Network, comingSoon: true },
            { name: t.navbar.creatorEconomy, desc: t.navbar.contentCreators, icon: Youtube, comingSoon: true },
          ],
        },
        {
          title: t.navbar.byBusinessSize,
          items: [
            { name: t.navbar.startups, desc: t.navbar.earlyStageCompanies, icon: TrendingUp, comingSoon: true },
            { name: t.navbar.enterprises, desc: t.navbar.largeOrganizations, icon: Building2, comingSoon: true },
            { name: t.navbar.smallBusiness, desc: t.navbar.localBusinesses, icon: Store, comingSoon: true },
          ],
        },
        {
          title: t.navbar.byIndustry,
          items: [
            { name: t.navbar.finance, desc: t.navbar.financialServices, icon: Wallet, comingSoon: true },
            { name: t.navbar.healthcare, desc: t.navbar.medicalWellness, icon: HelpCircle, comingSoon: true },
            { name: t.navbar.education, desc: t.navbar.schoolsCourses, icon: GraduationCap, comingSoon: true },
          ],
        },
        {
          title: t.navbar.useCases,
          items: [
            { name: t.navbar.subscriptions, desc: t.navbar.recurringRevenue, icon: Receipt, comingSoon: true },
            { name: t.navbar.invoicingTitle, desc: t.navbar.b2bPayments, icon: FileText, comingSoon: true },
            { name: t.navbar.globalSales, desc: t.navbar.internationalExpansion, icon: Globe, comingSoon: true },
          ],
        },
      ],
      sidebar: {
        title: t.navbar.caseStudies,
        content: t.navbar.caseStudiesContent,
        cta: t.navbar.viewAllStories,
      },
    },
  },
  {
    label: t.navbar.resources,
    megaMenu: {
      sections: [
        {
          title: t.navbar.learn,
          items: [
            { name: t.navbar.blog, desc: t.navbar.newsInsights, icon: Newspaper, href: lang === 'he' ? '/he/blog' : '/blog' },
          ],
        },
        {
          title: t.footer.support,
          items: [
            { name: t.navbar.helpCenter, desc: t.navbar.findAnswers, icon: HelpCircle },
            { name: t.navbar.contactSupport, desc: t.navbar.getHelp, icon: MessageSquare },
          ],
        },
      ],
      sidebar: {
        title: t.navbar.latestResources,
        content: t.navbar.latestResourcesContent,
        cta: t.navbar.browseAllResources,
      },
    },
  },
];

// MegaMenuPanel: portal into document.body (eliminates nav stacking-context interference).
// Pure CSS animation with animation-fill-mode:both — the browser applies the "from" keyframe
// state (opacity:0) before the very first paint, so there is never a visible flash or jump.
// No translateY means no vertical position shift that could be perceived as a jump.
function MegaMenuPanel({
  direction,
  slideDirection,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  direction: string;
  slideDirection?: 'left' | 'right' | null;
  onMouseEnter: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const animClass =
    slideDirection === 'left'
      ? 'mega-menu-enter-left'
      : slideDirection === 'right'
      ? 'mega-menu-enter-right'
      : 'mega-menu-enter';

  return createPortal(
    <div
      className={`mega-menu-portal ${animClass} fixed left-0 right-0 top-12 px-6 z-[99] pt-4`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ direction }}
    >
      {children}
    </div>,
    document.body
  );
}

export default function Navbar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { t, direction, language } = useLanguage();
  const { track } = useAnalytics();
  const { user } = useAuth();
  const isHe = language === 'he';
  const userOrgs = user?.orgMemberships ?? [];

  // Get nav items with current language
  const navItems = getNavItems(t, language);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [closeTimer, setCloseTimer] = useState<NodeJS.Timeout | null>(null);
  const [stabilizeTimer, setStabilizeTimer] = useState<NodeJS.Timeout | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isStabilizing, setIsStabilizing] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (closeTimer) clearTimeout(closeTimer);
      if (stabilizeTimer) clearTimeout(stabilizeTimer);
    };
  }, [closeTimer, stabilizeTimer]);

  const handleMouseEnter = (label: string) => {
    // Don't open if just unlocked (prevents flicker)
    if (justUnlocked) return;
    // Always clear the close timer
    if (closeTimer) {
      clearTimeout(closeTimer);
      setCloseTimer(null);
    }

    // If locked and hovering the same menu, just keep it open
    if (isLocked && openDropdown === label) {
      return;
    }

    // Track if we should calculate slide direction
    let shouldCalculateSlide = !isLocked;

    // If locked but hovering a different menu, unlock and switch
    if (isLocked && openDropdown && openDropdown !== label) {
      setIsLocked(false);
      shouldCalculateSlide = true; // We're unlocking, so calculate slide
    }

    // Determine slide direction based on menu order (only when switching to a DIFFERENT menu).
    // CRITICAL: skip this block when openDropdown === label (re-entering the same item's
    // hover zone). Without this guard, the else-branch fires setSlideDirection(null) which
    // resets a non-null slideDirection → key changes → React remounts MegaMenuPanel →
    // CSS animation replays → visible jump/flash on every mouse micro-movement.
    if (shouldCalculateSlide && openDropdown !== label) {
      const menuOrder = navItems.map(item => item.label);
      const currentIndex = menuOrder.indexOf(label);
      const previousIndex = openDropdown ? menuOrder.indexOf(openDropdown) : -1;

      if (previousIndex !== -1 && currentIndex !== previousIndex && openDropdown !== null) {
        // Mouse moving right = menu slides in from left
        // Mouse moving left = menu slides in from right
        const direction = currentIndex > previousIndex ? 'left' : 'right';
        setSlideDirection(direction);
      } else {
        setSlideDirection(null);
      }
    }

    // If opening a new menu (not switching), add stabilization period
    if (openDropdown !== label) {
      // Clear any existing stabilization timer
      if (stabilizeTimer) clearTimeout(stabilizeTimer);

      setIsStabilizing(true);
      const timer = setTimeout(() => {
        setIsStabilizing(false);
        setStabilizeTimer(null);
      }, 150);
      setStabilizeTimer(timer);
    }

    setOpenDropdown(label);
    setHoveredColumn(null);
  };

  const handleMouseLeave = () => {
    if (isLocked || isStabilizing) return; // Don't close if locked or stabilizing

    const timer = setTimeout(() => {
      setOpenDropdown(null);
      setHoveredColumn(null);
      setSlideDirection(null);
    }, 300); // Increased from 100ms to 300ms
    setCloseTimer(timer);
  };

  const handleMouseDown = (label: string) => {
    // Clear any pending timers
    if (closeTimer) {
      clearTimeout(closeTimer);
      setCloseTimer(null);
    }
    if (stabilizeTimer) {
      clearTimeout(stabilizeTimer);
      setStabilizeTimer(null);
      setIsStabilizing(false);
    }

    // Toggle lock instead of just locking
    if (isLocked && openDropdown === label) {
      setIsLocked(false);
      setOpenDropdown(null);
      // Prevent immediate re-hover from reopening menu
      setJustUnlocked(true);
      setTimeout(() => setJustUnlocked(false), 100);
    } else {
      setIsLocked(true);
      setOpenDropdown(label);
    }
  };

  const handleMouseUp = () => {
    // Don't unlock immediately, let the click toggle handle it
  };

  // Click outside to close menu when locked
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isLocked && openDropdown) {
        const target = e.target as HTMLElement;
        // Check if click is outside the navbar and mega menu
        if (!target.closest('nav') && !target.closest('.mega-menu-portal')) {
          setIsLocked(false);
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isLocked, openDropdown]);

  return (
    <>
    {/* Mobile full-page white menu */}
    {mobileOpen && (
      <div className="lg:hidden fixed inset-0 z-[200] bg-white overflow-y-auto">
        {/* Mobile header */}
        <div className="px-6 h-16 flex items-center justify-between" style={{ direction }}>
          <Link to={language === 'he' ? '/he' : '/'} className="flex items-center translate-y-1" onClick={() => setMobileOpen(false)}>
            <NexusLogo height={55} page="auth" variant="black" />
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 text-slate-900"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-6 py-6">
          {navItems.map((item) => (
            <div key={item.label} className="border-b border-slate-100">
              <a
                href={item.href || '#'}
                className="flex items-center justify-between py-4 text-slate-900 font-medium text-base"
                onClick={(e) => {
                  if (item.megaMenu) {
                    e.preventDefault();
                  }
                }}
              >
                {item.label}
                {item.megaMenu && <ChevronDown size={16} className="text-slate-400" />}
              </a>
            </div>
          ))}

          <div className="mt-8 space-y-3">
            <Link
              to={language === 'he' ? '/he/signup' : '/signup'}
              className="block bg-nx-primary text-white text-sm font-semibold px-5 py-3 rounded-lg text-center"
              onClick={() => setMobileOpen(false)}
            >
              {t.buttons.startNow}
            </Link>
            <Link
              to={language === 'he' ? '/he/login' : '/login'}
              className="block border border-slate-200 text-slate-700 text-sm font-semibold px-5 py-3 rounded-lg text-center"
              onClick={() => setMobileOpen(false)}
            >
              {t.navbar.signIn}
            </Link>
          </div>
        </div>
      </div>
    )}

    <nav className="absolute top-0 left-0 right-0 z-[100]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between" style={{ direction }}>
        {/* Logo */}
        <Link to={language === 'he' ? '/he' : '/'} className="flex items-center translate-y-1 flex-shrink-0">
          <NexusLogo height={55} page="navbar" variant={variant === 'dark' ? 'black' : undefined} />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1" style={{ marginTop: '2px' }}>
          {navItems.map((item) => {
            const megaMenuEnabled = item.megaMenu && !item.disableMegaMenu;
            return (
            <div
              key={item.label}
              className="relative group"
              onMouseEnter={() => megaMenuEnabled && handleMouseEnter(item.label)}
              onMouseLeave={() => { if (megaMenuEnabled) handleMouseLeave(); }}
            >
              <a
                href={item.href || '#'}
                className={`flex items-center gap-1 px-4 py-2 text-sm rounded-lg transition-all ${
                  isLocked && openDropdown === item.label
                    ? variant === 'dark' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-900'
                    : variant === 'dark' ? 'text-slate-800 hover:text-slate-900 hover:bg-slate-100' : 'text-white/80 hover:text-slate-900 hover:bg-white'
                }`}
                onMouseDown={(e) => {
                  if (megaMenuEnabled) {
                    e.preventDefault();
                    handleMouseDown(item.label);
                  }
                }}
                onMouseUp={(e) => {
                  if (megaMenuEnabled) {
                    e.preventDefault();
                    handleMouseUp();
                  }
                }}
              >
                {item.label}
                {item.megaMenu && (
                  <ChevronDown size={14} className="opacity-50" />
                )}
              </a>

              {/* Tooltip for disabled mega menu items */}
              {item.disableMegaMenu && item.tooltip && (
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-800 text-white text-[11px] font-medium px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-[101] shadow-lg">
                  {item.tooltip}
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
                </span>
              )}

              {/* Mega Menu */}
              {megaMenuEnabled && openDropdown === item.label && (
                <MegaMenuPanel
                  key={`${item.label}-${slideDirection || 'initial'}`}
                  direction={direction}
                  slideDirection={slideDirection}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    handleMouseEnter(item.label);
                  }}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="max-w-7xl mx-auto">
                    <div className="bg-white shadow-2xl rounded-2xl overflow-hidden border border-gray-200 flex">
                      {/* Main Grid */}
                      <div className={`flex-1 p-8 grid gap-x-8 gap-y-10 ${
                        item.megaMenu.sections.length === 1 ? 'grid-cols-1' :
                        item.megaMenu.sections.length === 2 ? 'grid-cols-2' :
                        item.megaMenu.sections.length === 3 ? 'grid-cols-3' :
                        item.megaMenu.sections.length === 5 ? 'grid-cols-5' : 'grid-cols-4'
                      }`}>
                        {item.megaMenu.sections.map((section, index) => (
                          <div
                            key={section.title}
                            onMouseEnter={() => setHoveredColumn(index)}
                            onMouseLeave={() => setHoveredColumn(null)}
                          >
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-6 pb-2 relative">
                              {section.title}
                              <div
                                className={`absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-300 ${
                                  hoveredColumn === index
                                    ? 'bg-gradient-to-r from-teal-500 via-sky-500 to-orange-400'
                                    : 'bg-slate-100'
                                }`}
                              />
                            </h3>
                            <div className="space-y-6">
                              {section.items.map((subItem) => {
                                const Icon = subItem.icon;
                                const isComingSoon = (subItem as any).comingSoon;
                                return (
                                  <a
                                    key={subItem.name}
                                    href={isComingSoon ? undefined : ((subItem as any).href || '#')}
                                    className={`group flex items-start gap-3 relative ${isComingSoon ? 'cursor-default' : ''}`}
                                    onClick={isComingSoon ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                                  >
                                    <Icon className={`text-xl mt-0.5 group-hover:scale-110 transition-transform ${isComingSoon ? 'text-slate-400' : 'text-nx-primary'}`} size={20} />
                                    <div>
                                      <div className={`font-semibold text-sm transition-colors ${isComingSoon ? 'text-slate-400' : 'text-slate-900 group-hover:text-nx-primary'}`}>
                                        {subItem.name}
                                      </div>
                                      <p className="text-[13px] text-slate-500">{subItem.desc}</p>
                                    </div>
                                    {isComingSoon && (
                                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        {t.navbar.comingSoon}
                                      </span>
                                    )}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Sidebar */}
                      <div
                        className={`w-[320px] bg-slate-50 ${direction === 'rtl' ? 'border-r' : 'border-l'} border-slate-100 p-8`}
                        onMouseEnter={() => setHoveredColumn(4)}
                        onMouseLeave={() => setHoveredColumn(null)}
                      >
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-6 pb-2 relative">
                          {item.megaMenu.sidebar.title}
                          <div
                            className={`absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-300 ${
                              hoveredColumn === 4
                                ? 'bg-gradient-to-r from-teal-500 via-sky-500 to-orange-400'
                                : 'bg-slate-100'
                            }`}
                          />
                        </h3>
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mb-6">
                          {(item.label === 'Products' || item.label === 'מוצרים') ? (
                            <a
                              href={item.megaMenu.sidebar.link || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full h-32 rounded-lg mb-4 overflow-hidden relative group cursor-pointer"
                            >
                              <img
                                src="/globes-article.webp"
                                alt="Globes Article"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            </a>
                          ) : (
                            <div className="w-full h-24 bg-gradient-to-br from-nx-primary to-nx-blue rounded-lg mb-4 flex items-center justify-center text-white font-bold text-sm">
                              Nexus
                            </div>
                          )}
                          <p className="text-[12px] text-slate-500 mb-3 leading-tight">
                            {item.megaMenu.sidebar.content}
                          </p>
                          <a
                            href={item.megaMenu.sidebar.link || '#'}
                            target={item.megaMenu.sidebar.link ? '_blank' : undefined}
                            rel={item.megaMenu.sidebar.link ? 'noopener noreferrer' : undefined}
                            className="text-xs font-bold text-nx-primary flex items-center gap-1 hover:gap-2 transition-all"
                          >
                            {item.megaMenu.sidebar.cta} <ArrowRight size={12} className={direction === 'rtl' ? 'scale-x-[-1]' : ''} />
                          </a>
                        </div>
                      </div>
                    </div>

                  </div>
                </MegaMenuPanel>
              )}
            </div>
          );
          })}
        </div>

        {/* Desktop CTA */}
        <div className="hidden lg:flex items-center gap-4">
          {user ? (
            // ── Authenticated user ──────────────────────────────
            userOrgs.length > 0 ? (
              // Has org(s) — show Dashboard button
              userOrgs.length === 1 ? (
                <a
                  href={`${DASHBOARD_URL}/organizations/${userOrgs[0].org.slug}`}
                  className="group flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all hover:shadow-lg hover:shadow-nx-primary/25"
                >
                  {isHe ? 'דשבורד' : 'Dashboard'}
                  <span className="inline-block w-0 overflow-hidden group-hover:w-4 transition-all duration-300 ease-out">
                    <ArrowRight size={14} className={`inline ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
                  </span>
                </a>
              ) : (
                <Link
                  to={isHe ? '/he/org-select' : '/org-select'}
                  className="group flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all hover:shadow-lg hover:shadow-nx-primary/25"
                >
                  {isHe ? 'דשבורד' : 'Dashboard'}
                  <span className="inline-block w-0 overflow-hidden group-hover:w-4 transition-all duration-300 ease-out">
                    <ArrowRight size={14} className={`inline ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
                  </span>
                </Link>
              )
            ) : (
              // Has no org — link to personal dashboard
              <Link
                to={isHe ? '/he/dashboard' : '/dashboard'}
                className={`text-sm ${variant === 'dark' ? 'text-slate-800 hover:text-slate-900 hover:bg-slate-100' : 'text-white/80 hover:text-slate-900 hover:bg-white'} px-4 py-2 rounded-lg transition-all`}
              >
                {isHe ? 'החשבון שלי' : 'My Account'}
              </Link>
            )
          ) : (
            // ── Unauthenticated ────────────────────────────────
            <>
              <Link to={language === 'he' ? '/he/login' : '/login'} className={`text-sm ${variant === 'dark' ? 'text-slate-800 hover:text-slate-900 hover:bg-slate-100' : 'text-white/80 hover:text-slate-900 hover:bg-white'} px-4 py-2 rounded-lg transition-all`}>
                {t.navbar.signIn}
              </Link>
              <Link
                to={language === 'he' ? '/he/signup' : '/signup'}
                className="group flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all hover:shadow-lg hover:shadow-nx-primary/25"
                onClick={() => track(MARKETING.NAVBAR_CTA_CLICKED, 'MARKETING', { button_text: t.navbar.getStarted, destination: 'signup' })}
              >
                {t.navbar.getStarted}
                <span className="inline-block w-0 overflow-hidden group-hover:w-4 transition-all duration-300 ease-out">
                  <ArrowRight size={14} className={`inline ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
                </span>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(true)}
          className={`lg:hidden p-2 ${variant === 'dark' ? 'text-slate-900' : 'text-white'}`}
        >
          <Menu size={24} />
        </button>
      </div>
    </nav>
    </>
  );
}
