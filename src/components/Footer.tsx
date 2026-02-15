import NexusLogo from './NexusLogo';
import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'he', name: 'עברית', flag: '🇮🇱' },
];

const FlagIcon = ({ code }: { code: string }) => {
  if (code === 'en') {
    return (
      <svg width="20" height="15" viewBox="0 0 20 15" className="rounded-sm">
        <rect width="20" height="15" fill="#B22234"/>
        <path d="M0 0h20v1H0zm0 2h20v1H0zm0 2h20v1H0zm0 2h20v1H0zm0 2h20v1H0zm0 2h20v1H0zm0 2h20v1H0z" fill="white"/>
        <rect width="8" height="7" fill="#3C3B6E"/>
      </svg>
    );
  }
  return (
    <svg width="20" height="15" viewBox="0 0 220 160" className="rounded-sm">
      <rect width="220" height="160" fill="white"/>
      <rect width="220" height="15" y="25" fill="#0038b8"/>
      <rect width="220" height="15" y="120" fill="#0038b8"/>
      <path d="M 110,62 L 120,77 L 138,77 L 125,88 L 130,105 L 110,94 L 90,105 L 95,88 L 82,77 L 100,77 Z" fill="none" stroke="#0038b8" strokeWidth="3.5"/>
      <path d="M 110,88 L 120,73 L 138,73 L 125,62 L 130,45 L 110,56 L 90,45 L 95,62 L 82,73 L 100,73 Z" fill="none" stroke="#0038b8" strokeWidth="3.5"/>
    </svg>
  );
};

export default function Footer() {
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t, direction } = useLanguage();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const footerLinks = [
    {
      title: t.footer.products,
      links: [
        t.footer.payments, t.footer.billing, t.footer.connect,
        t.footer.radar, t.footer.terminal, t.footer.atlas, t.footer.sigma,
      ],
    },
    {
      title: t.footer.useCases,
      links: [
        t.footer.saas, t.footer.ecommerce, t.footer.marketplaces,
        t.footer.financeAutomation, t.footer.crypto, t.footer.creatorEconomy,
      ],
    },
    {
      title: t.footer.developers,
      links: [
        t.footer.documentation, t.footer.apiReference, t.footer.apiStatus,
        t.footer.apiChangelog, t.footer.openSource,
      ],
    },
    {
      title: t.footer.company,
      links: [
        t.footer.aboutNexus, t.footer.customers, t.footer.partners,
        t.footer.jobs, t.footer.newsroom, t.footer.blog,
      ],
    },
  ];

  return (
    <footer className="relative py-24 bg-white">
      {/* Diagonal slanted background */}
      <div
        className="absolute bg-slate-100"
        style={{
          top: '-100px',
          left: 0,
          right: 0,
          bottom: 0,
          clipPath: direction === 'rtl'
            ? 'polygon(0 100px, 100% 0, 100% 100%, 0 100%)'
            : 'polygon(0 0, 100% 100px, 100% 100%, 0 100%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
          {/* Left Column - Logo, Address, Language */}
          <div className="col-span-2 md:col-span-1">
            <img
              src="/nexus-logo.png"
              alt="Nexus Logo"
              className="h-12 mb-4"
            />
            <address className="text-sm text-slate-600 not-italic mb-6 leading-relaxed">
              {t.footer.addressLine1}<br />
              {t.footer.addressLine2}
            </address>

            {/* Language Selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-3 pl-3 pr-8 py-2.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-all"
              >
                <FlagIcon code={selectedLanguage} />
                <span>{languages.find(lang => lang.code === selectedLanguage)?.name}</span>

                {/* Dropdown Arrow */}
                <svg
                  width="10"
                  height="6"
                  viewBox="0 0 10 6"
                  fill="none"
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M1 1L5 5L9 1" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-300 rounded-lg shadow-lg overflow-hidden z-10 animate-fade-in">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setSelectedLanguage(lang.code);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                        selectedLanguage === lang.code
                          ? 'bg-stripe-purple/10 text-stripe-purple'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <FlagIcon code={lang.code} />
                      <span>{lang.name}</span>
                      {selectedLanguage === lang.code && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          className="ml-auto"
                        >
                          <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Link Columns */}
          {footerLinks.map((category) => (
            <div key={category.title}>
              <h4 className="text-slate-900 font-semibold text-sm mb-6">{category.title}</h4>
              <ul className="space-y-4">
                {category.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-400">{t.footer.allRightsReserved}</p>
        </div>
      </div>
    </footer>
  );
}
