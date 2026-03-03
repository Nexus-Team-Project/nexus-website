import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Menu, X, ArrowRight, CreditCard, Link as LinkIcon, ShoppingCart, Layers, Receipt, BarChart3, Scale, TrendingUp, Building2, Globe, Wallet, Bitcoin, Network, FileText, HelpCircle, AppWindow, Users, Store, Briefcase, Code, Book, Terminal, Newspaper, GraduationCap, MessageSquare, Youtube, Gift, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import NexusLogo from './NexusLogo';
import { useLanguage } from '../i18n/LanguageContext';

// Function to get nav items with translations
const getNavItems = (t: any, lang: 'en' | 'he') => [
  {
    label: t.navbar.products,
    megaMenu: {
      sections: [
        {
          title: t.navbar.payments,
          items: [
            { name: t.navbar.payments, desc: t.navbar.paymentsOnline, icon: CreditCard },
            { name: t.navbar.paymentLinks, desc: t.navbar.paymentLinksDesc, icon: LinkIcon },
            { name: t.navbar.checkout, desc: t.navbar.checkoutDesc, icon: ShoppingCart },
            { name: t.navbar.elements, desc: t.navbar.elementsDesc, icon: Layers },
          ],
        },
        {
          title: t.navbar.revenue,
          items: [
            { name: t.navbar.loyaltyPartnerships, desc: t.navbar.loyaltyPartnershipsDesc, icon: Gift },
            { name: t.navbar.loyaltyClub, desc: t.navbar.loyaltyClubDesc, icon: Users },
            { name: t.navbar.giftsWelfare, desc: t.navbar.giftsWelfareDesc, icon: Heart },
          ],
        },
        {
          title: t.navbar.moneyManagement,
          items: [
            { name: t.navbar.financialAccounts, desc: t.navbar.businessFinances, icon: Building2 },
            { name: t.navbar.globalPayouts, desc: t.navbar.payoutsThirdParties, icon: Globe },
            { name: t.navbar.capital, desc: t.navbar.businessFinancing, icon: Wallet },
            { name: t.navbar.cryptocurrency, desc: t.navbar.walletCardInfra, icon: Bitcoin },
          ],
        },
        {
          title: t.navbar.platformsSection,
          items: [
            { name: t.navbar.connectTitle, desc: t.navbar.multiPartyPayments, icon: Network },
            { name: t.navbar.issuing, desc: t.navbar.physicalVirtualCards, icon: CreditCard },
            { name: t.navbar.forPlatforms, desc: t.navbar.embeddedFinancialServices, icon: Building2 },
          ],
        },
      ],
      sidebar: {
        title: t.navbar.inTheNews,
        content: t.navbar.newsContent,
        cta: t.navbar.readArticle,
        link: 'https://www.globes.co.il/news/article.aspx?did=1001533300',
      },
      bottomLinks: [
        { label: t.navbar.documentation, icon: FileText },
        { label: t.navbar.helpCenter, icon: HelpCircle },
        { label: t.navbar.appMarketplace, icon: AppWindow },
      ],
    },
  },
  {
    label: t.navbar.solutions,
    megaMenu: {
      sections: [
        {
          title: t.navbar.byBusinessType,
          items: [
            { name: t.navbar.saas, desc: t.navbar.saasCompanies, icon: Code },
            { name: t.navbar.ecommerce, desc: t.navbar.ecommerceStores, icon: Store },
            { name: t.navbar.marketplaces, desc: t.navbar.multiVendorPlatforms, icon: Network },
            { name: t.navbar.creatorEconomy, desc: t.navbar.contentCreators, icon: Youtube },
          ],
        },
        {
          title: t.navbar.byBusinessSize,
          items: [
            { name: t.navbar.startups, desc: t.navbar.earlyStageCompanies, icon: TrendingUp },
            { name: t.navbar.enterprises, desc: t.navbar.largeOrganizations, icon: Building2 },
            { name: t.navbar.smallBusiness, desc: t.navbar.localBusinesses, icon: Store },
          ],
        },
        {
          title: t.navbar.byIndustry,
          items: [
            { name: t.navbar.finance, desc: t.navbar.financialServices, icon: Wallet },
            { name: t.navbar.healthcare, desc: t.navbar.medicalWellness, icon: HelpCircle },
            { name: t.navbar.education, desc: t.navbar.schoolsCourses, icon: GraduationCap },
          ],
        },
        {
          title: t.navbar.useCases,
          items: [
            { name: t.navbar.subscriptions, desc: t.navbar.recurringRevenue, icon: Receipt },
            { name: t.navbar.invoicingTitle, desc: t.navbar.b2bPayments, icon: FileText },
            { name: t.navbar.globalSales, desc: t.navbar.internationalExpansion, icon: Globe },
          ],
        },
      ],
      sidebar: {
        title: t.navbar.caseStudies,
        content: t.navbar.caseStudiesContent,
        cta: t.navbar.viewAllStories,
      },
      bottomLinks: [
        { label: t.navbar.customerStories, icon: Users },
        { label: t.navbar.partnerProgram, icon: Network },
      ],
    },
  },
  {
    label: t.navbar.developers,
    megaMenu: {
      sections: [
        {
          title: t.navbar.getStartedSection,
          items: [
            { name: t.navbar.documentation, desc: t.navbar.integrationGuides, icon: FileText },
            { name: t.navbar.apiReference, desc: t.navbar.completeAPIDocs, icon: Code },
            { name: t.navbar.quickStart, desc: t.navbar.startInMinutes, icon: ArrowRight },
            { name: t.navbar.tutorials, desc: t.navbar.stepByStepGuides, icon: GraduationCap },
          ],
        },
        {
          title: t.navbar.toolsSDKs,
          items: [
            { name: t.navbar.javascriptSDK, desc: t.navbar.forWebApps, icon: Terminal },
            { name: t.navbar.mobileSDKs, desc: t.navbar.iosAndroid, icon: AppWindow },
            { name: t.navbar.serverLibraries, desc: t.navbar.nodePythonRuby, icon: Code },
            { name: t.navbar.cliTools, desc: t.navbar.commandLine, icon: Terminal },
          ],
        },
        {
          title: t.navbar.resources,
          items: [
            { name: t.navbar.apiStatus, desc: t.navbar.systemPerformance, icon: BarChart3 },
            { name: t.navbar.changelog, desc: t.navbar.latestUpdates, icon: FileText },
            { name: t.navbar.codeSamples, desc: t.navbar.exampleProjects, icon: Code },
          ],
        },
        {
          title: t.navbar.community,
          items: [
            { name: t.navbar.developerForum, desc: t.navbar.askQuestions, icon: MessageSquare },
            { name: t.navbar.github, desc: t.navbar.openSource, icon: Network },
            { name: t.footer.support, desc: t.navbar.getHelp, icon: HelpCircle },
          ],
        },
      ],
      sidebar: {
        title: t.navbar.developerTools,
        content: t.navbar.developerToolsContent,
        cta: t.navbar.exploreTools,
      },
      bottomLinks: [
        { label: t.navbar.apiDocumentation, icon: FileText, href: 'https://nexus-api-docs-production.up.railway.app/' },
        { label: t.navbar.developerCommunity, icon: Users },
      ],
    },
  },
  {
    label: t.navbar.resources,
    megaMenu: {
      sections: [
        {
          title: t.navbar.learn,
          items: [
            { name: t.navbar.blog, desc: t.navbar.newsInsights, icon: Newspaper },
            { name: t.navbar.guides, desc: t.navbar.bestPractices, icon: Book },
            { name: t.navbar.webinars, desc: t.navbar.liveTraining, icon: Youtube },
            { name: t.navbar.videoTutorials, desc: t.navbar.watchAndLearn, icon: Youtube },
          ],
        },
        {
          title: t.footer.support,
          items: [
            { name: t.navbar.helpCenter, desc: t.navbar.findAnswers, icon: HelpCircle },
            { name: t.navbar.contactSupport, desc: t.navbar.getHelp, icon: MessageSquare },
            { name: t.navbar.apiStatus, desc: t.navbar.systemStatus, icon: BarChart3 },
          ],
        },
        {
          title: t.navbar.company,
          items: [
            { name: t.navbar.aboutUs, desc: t.navbar.ourStory, icon: Building2 },
            { name: t.navbar.careers, desc: t.navbar.joinOurTeam, icon: Users },
            { name: t.navbar.pressKit, desc: t.navbar.mediaResources, icon: FileText },
          ],
        },
        {
          title: t.navbar.customerStories,
          items: [
            { name: t.navbar.caseStudies, desc: t.navbar.successStories, icon: TrendingUp },
            { name: t.testimonials.title, desc: t.navbar.whatCustomersSay, icon: MessageSquare },
            { name: t.footer.partners, desc: t.navbar.ourEcosystem, icon: Network },
          ],
        },
      ],
      sidebar: {
        title: t.navbar.latestResources,
        content: t.navbar.latestResourcesContent,
        cta: t.navbar.browseAllResources,
      },
      bottomLinks: [
        { label: t.navbar.supportCenter, icon: HelpCircle },
        { label: t.navbar.communityForum, icon: MessageSquare },
      ],
    },
  },
  { label: t.navbar.pricing, href: '#pricing' },
];

// MegaMenuPanel: mounts at opacity:0, rAF flips to opacity:1 via CSS transition.
// This guarantees the element is NEVER seen at its natural (un-animated) state,
// eliminating the starting-position jump caused by React applying `animation` via
// the style prop only AFTER the first paint.
function MegaMenuPanel({
  direction,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  direction: string;
  onMouseEnter: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => setVisible(true));
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className="fixed left-0 right-0 top-12 px-6 z-50 pt-4"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        direction,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.15s ease-out',
      }}
    >
      {children}
    </div>
  );
}

export default function Navbar() {
  const { t, direction, language } = useLanguage();

  // Get nav items with current language
  const navItems = getNavItems(t, language);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [closeTimer, setCloseTimer] = useState<NodeJS.Timeout | null>(null);
  const [stabilizeTimer, setStabilizeTimer] = useState<NodeJS.Timeout | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
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

    // If locked but hovering a different menu, unlock and switch
    if (isLocked && openDropdown && openDropdown !== label) {
      setIsLocked(false);
    }

    // If opening a new menu (not switching), add stabilization period
    if (openDropdown !== label) {
      // Clear any existing stabilization timer
      if (stabilizeTimer) clearTimeout(stabilizeTimer);

      setIsStabilizing(true);
      const timer = setTimeout(() => {
        setIsStabilizing(false);
        setStabilizeTimer(null);
      }, 220); // covers full animation duration (200ms) + small buffer
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
    }, 300);
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
        if (!target.closest('nav')) {
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
              className="block bg-stripe-purple text-white text-sm font-semibold px-5 py-3 rounded-lg text-center"
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
          <NexusLogo height={55} page="navbar" />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1" style={{ marginTop: '2px' }}>
          {navItems.map((item) => (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => item.megaMenu && handleMouseEnter(item.label)}
              onMouseLeave={handleMouseLeave}
            >
              <a
                href={item.href || '#'}
                className={`flex items-center gap-1 px-4 py-2 text-sm rounded-lg transition-all ${
                  isLocked && openDropdown === item.label
                    ? 'bg-white text-slate-900'
                    : 'text-white/80 hover:text-slate-900 hover:bg-white'
                }`}
                onMouseDown={(e) => {
                  if (item.megaMenu) {
                    e.preventDefault();
                    handleMouseDown(item.label);
                  }
                }}
                onMouseUp={(e) => {
                  if (item.megaMenu) {
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

              {/* Mega Menu */}
              {item.megaMenu && openDropdown === item.label && (
                <MegaMenuPanel
                  key={item.label}
                  direction={direction}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    handleMouseEnter(item.label);
                  }}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="max-w-7xl mx-auto space-y-4">
                    <div className="bg-white shadow-2xl rounded-2xl overflow-hidden border border-gray-200 flex">
                      {/* Main Grid */}
                      <div className="flex-1 p-8 grid grid-cols-4 gap-x-8 gap-y-10">
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
                                    ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400'
                                    : 'bg-slate-100'
                                }`}
                              />
                            </h3>
                            <div className="space-y-6">
                              {section.items.map((subItem) => {
                                const Icon = subItem.icon;
                                return (
                                  <a
                                    key={subItem.name}
                                    href="#"
                                    className="group flex items-start gap-3"
                                  >
                                    <Icon className="text-stripe-purple text-xl mt-0.5 group-hover:scale-110 transition-transform" size={20} />
                                    <div>
                                      <div className="font-semibold text-sm text-slate-900 group-hover:text-stripe-purple transition-colors">
                                        {subItem.name}
                                      </div>
                                      <p className="text-[13px] text-slate-500">{subItem.desc}</p>
                                    </div>
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
                                ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400'
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
                                src="/globes-article.png"
                                alt="Globes Article"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            </a>
                          ) : (
                            <div className="w-full h-24 bg-gradient-to-br from-stripe-purple to-stripe-blue rounded-lg mb-4 flex items-center justify-center text-white font-bold text-sm">
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
                            className="text-xs font-bold text-stripe-purple flex items-center gap-1 hover:gap-2 transition-all"
                          >
                            {item.megaMenu.sidebar.cta} <ArrowRight size={12} className={direction === 'rtl' ? 'scale-x-[-1]' : ''} />
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Links */}
                    <div className="bg-slate-50/50 backdrop-blur-sm mt-4 rounded-xl p-4 flex items-center justify-center gap-10 border border-white/20">
                      {item.megaMenu.bottomLinks.map((link) => {
                        const Icon = link.icon;
                        return (
                          <a
                            key={link.label}
                            href={(link as any).href || '#'}
                            target={(link as any).href ? '_blank' : undefined}
                            rel={(link as any).href ? 'noopener noreferrer' : undefined}
                            className="group text-sm font-semibold text-slate-600 hover:text-stripe-purple flex items-center gap-2 transition-colors"
                          >
                            <Icon size={18} />
                            {link.label}
                            <ArrowRight
                              size={14}
                              className={`opacity-0 group-hover:opacity-100 transition-opacity ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`}
                            />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </MegaMenuPanel>
              )}
            </div>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden lg:flex items-center gap-4">
          <Link to={language === 'he' ? '/he/login' : '/login'} className="text-sm text-white/80 hover:text-slate-900 hover:bg-white px-4 py-2 rounded-lg transition-all">
            {t.navbar.signIn}
          </Link>
          <Link
            to={language === 'he' ? '/he/signup' : '/signup'}
            className="group flex items-center gap-2 bg-stripe-purple hover:bg-stripe-purple/90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all hover:shadow-lg hover:shadow-stripe-purple/25"
          >
            {t.navbar.getStarted}
            <span className="inline-block w-0 overflow-hidden group-hover:w-4 transition-all duration-300 ease-out">
              <ArrowRight size={14} className={`inline ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
            </span>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden p-2 text-white"
        >
          <Menu size={24} />
        </button>
      </div>
    </nav>
    </>
  );
}
