import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { MARKETING } from '../lib/analyticsEvents';

export default function CTA() {
  const [isCopied, setIsCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { t, direction, language } = useLanguage();
  const { track } = useAnalytics();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (panelRef.current) {
      observer.observe(panelRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const renderCodeWithSyntax = (code: string) => {
    return code
      .replace(/curl/g, '<span class="text-purple-400">curl</span>')
      .replace(/POST|GET|PUT|DELETE/g, (match) => `<span class="text-green-400">${match}</span>`)
      .replace(/'([^']+)'/g, (match) => `<span class="text-yellow-400">${match}</span>`)
      .replace(/("[\w]+"):/g, (match) => `<span class="text-blue-400">${match}</span>`);
  };

  const codeExample = `curl -X POST \\
  'https://api.nexus.com/purchase' \\
  -H 'Authorization: Bearer <partnerToken>' \\
  -H 'Content-Type: application/json' \\
  --data-binary '{
    "tenantId": "tenant_001",
    "offerId": "offer_12345",
    "email": "user@example.com",
    "amount": 250,
    "receiptDetails": {
      "fullName": "John Doe",
      "email": "user@example.com",
      "phone": "0501234567",
      "notes": "Gift purchase"
    }
  }'`;

  return (
    <section className="relative pt-32 pb-32 -mt-24 overflow-hidden">
      {/* Diagonal slanted background */}
      <div
        className="absolute inset-0 bg-nx-blue"
        style={{
          clipPath: direction === 'rtl'
            ? 'polygon(0 0, 100% 100px, 100% 100%, 0 100%)'
            : 'polygon(0 100px, 100% 0, 100% 100%, 0 100%)',
        }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-nx-primary/20 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left side - Text content */}
          <div>
            <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight mb-6">
              {t.cta.builtForDevelopers}
            </h2>
            <p className="text-lg text-white/80 mb-6 leading-relaxed">
              {t.cta.apiDescription}
            </p>
            <p className="text-base text-white/60 mb-8 leading-relaxed">
              {t.cta.apiDetails}
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                to={language === 'he' ? '/he/signup' : '/signup'}
                className="group inline-flex items-center gap-2 bg-nx-primary hover:bg-nx-primary/90 text-white font-medium px-8 py-4 rounded-lg transition-all hover:shadow-xl hover:shadow-nx-primary/25 text-sm"
                onClick={() => track(MARKETING.HERO_CTA_CLICKED, 'MARKETING', { button_text: t.cta.startBuilding, variant: 'cta_section' })}
              >
                {t.cta.startBuilding}
                <span className="inline-block w-0 overflow-hidden group-hover:w-5 transition-all duration-300 ease-out">
                  <ArrowRight size={16} className={`inline ${direction === 'rtl' ? 'scale-x-[-1]' : ''}`} />
                </span>
              </Link>
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-8 py-4 rounded-lg transition-all text-sm"
              >
                {t.cta.viewAPIDocs}
              </a>
            </div>
          </div>

          {/* Right side - Code panel */}
          <div
            ref={panelRef}
            className={`relative transition-all duration-1000 ${
              isVisible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-12'
            }`}
          >
            <div className="bg-[#0B1120] rounded-lg shadow-2xl flex flex-col relative overflow-hidden">
              {/* Code panel header */}
              <div className="px-4 py-3 bg-slate-800 flex items-center justify-between border-b border-slate-700 rounded-t-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">
                    {t.cta.example}
                  </span>
                  <span className="text-xs text-white font-semibold">{t.cta.createPurchaseSession}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400 font-mono">cURL</span>
                  <div className="relative group">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(codeExample);
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      }}
                      className="text-slate-400 hover:text-white p-1 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isCopied ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        )}
                      </svg>
                    </button>
                    <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 shadow-lg z-50">
                      {isCopied ? t.cta.copied : t.cta.copy}
                    </div>
                  </div>
                </div>
              </div>

              {/* Code content */}
              <div className="p-4 font-mono text-xs leading-relaxed overflow-x-auto bg-[#0B1120] text-slate-300 max-h-[400px] overflow-y-auto">
                <div className="flex gap-4 min-w-max">
                  <div className="text-slate-600 text-right select-none pr-2 border-r border-slate-800 shrink-0">
                    {codeExample.split('\n').map((_, i) => (
                      <div key={i} className="code-line">{i + 1}</div>
                    ))}
                  </div>
                  <div className="whitespace-pre shrink-0 text-slate-300">
                    {codeExample.split('\n').map((line, i) => (
                      <div
                        key={i}
                        className="code-line"
                        dangerouslySetInnerHTML={{ __html: renderCodeWithSyntax(line) }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative elements */}
            <div className="absolute -z-10 -top-4 -right-4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl" />
            <div className="absolute -z-10 -bottom-4 -left-4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
