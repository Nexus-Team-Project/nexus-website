import { useEffect, useState, lazy, Suspense } from 'react';
import { Copy, Check, ChevronRight, Lock, Zap, Globe, Code, Terminal, Book } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useLanguage } from '../i18n/LanguageContext';

const Footer = lazy(() => import('../components/Footer'));

// ─── scroll-reveal observer ────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('revealed'); observer.unobserve(e.target); }
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.scroll-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Copy button for code blocks ───────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-slate-400 hover:text-white"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ─── Syntax-highlighted code block ─────────────────────────
function CodeBlock({ code, language: lang = 'bash' }: { code: string; language?: string }) {
  const highlighted = code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(curl|const|let|var|import|from|await|async|return|new|function)/g, '<span class="text-purple-400">$1</span>')
    .replace(/(POST|GET|PUT|DELETE|PATCH)/g, '<span class="text-green-400">$1</span>')
    .replace(/('https?:[^']*')/g, '<span class="text-yellow-400">$1</span>')
    .replace(/("[\w_]+")\s*:/g, '<span class="text-blue-400">$1</span>:')
    .replace(/(\/\/.*$)/gm, '<span class="text-slate-500">$1</span>')
    .replace(/(#.*$)/gm, '<span class="text-slate-500">$1</span>');

  return (
    <div className="relative group rounded-xl bg-[#0d1117] border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-xs text-slate-500 uppercase tracking-wider">{lang}</span>
      </div>
      <CopyButton text={code} />
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

// ─── Sidebar nav item ──────────────────────────────────────
function SidebarItem({
  label, id, active, onClick, indent = false,
}: { label: string; id: string; active: boolean; onClick: (id: string) => void; indent?: boolean }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
        indent ? 'ml-4' : ''
      } ${active
        ? 'bg-stripe-purple/10 text-stripe-purple font-medium'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Method badge ──────────────────────────────────────────
function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-green-100 text-green-700 border-green-200',
    POST: 'bg-blue-100 text-blue-700 border-blue-200',
    PUT: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    PATCH: 'bg-orange-100 text-orange-700 border-orange-200',
    DELETE: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${colors[method] || 'bg-slate-100 text-slate-700'}`}>
      {method}
    </span>
  );
}

// ─── Translations ──────────────────────────────────────────
const t = {
  en: {
    pageTitle: 'API Documentation',
    pageSubtitle: 'Everything you need to integrate Nexus payments and loyalty into your application.',
    gettingStarted: 'Getting Started',
    authentication: 'Authentication',
    baseUrl: 'Base URL',
    endpoints: 'Endpoints',
    purchases: 'Purchases',
    offers: 'Offers',
    members: 'Members',
    webhooks: 'Webhooks',
    errors: 'Error Handling',
    rateLimiting: 'Rate Limiting',
    sdks: 'SDKs & Libraries',
    // Hero section
    heroLabel: 'Developer Documentation',
    heroTitle: 'Build with the Nexus API',
    heroSubtitle: 'Integrate payments, loyalty programs, and member management into your application with our RESTful API.',
    quickStartBtn: 'Quick Start Guide',
    fullRefBtn: 'Full Reference',
    // Getting Started
    gettingStartedTitle: 'Getting Started',
    gettingStartedDesc: 'The Nexus API is organized around REST. Our API accepts JSON-encoded request bodies, returns JSON-encoded responses, and uses standard HTTP response codes and authentication.',
    step1Title: 'Get your API keys',
    step1Desc: 'Sign up for a Nexus account and navigate to the Dashboard to find your API keys.',
    step2Title: 'Install an SDK',
    step2Desc: 'Use our official SDKs for JavaScript, Python, or make direct HTTP requests.',
    step3Title: 'Make your first request',
    step3Desc: 'Test the API with a simple request to verify your integration.',
    // Auth
    authTitle: 'Authentication',
    authDesc: 'The Nexus API uses Bearer tokens for authentication. Include your API key in the Authorization header of every request.',
    authWarning: 'Keep your API keys secure. Do not share them in client-side code or public repositories.',
    // Base URL
    baseUrlTitle: 'Base URL',
    baseUrlDesc: 'All API requests should be made to the following base URL:',
    // Endpoints
    purchasesTitle: 'Purchases',
    purchasesDesc: 'Create and manage purchase sessions for processing payments.',
    createPurchase: 'Create a Purchase',
    createPurchaseDesc: 'Creates a new purchase session. Returns a session URL for redirecting the customer to complete payment.',
    requestBody: 'Request Body',
    response: 'Response',
    offersTitle: 'Offers',
    offersDesc: 'Retrieve and manage available offers for your tenants.',
    listOffers: 'List Offers',
    listOffersDesc: 'Returns a list of all active offers for the specified tenant.',
    getOffer: 'Get Offer',
    getOfferDesc: 'Retrieves a specific offer by its ID.',
    membersTitle: 'Members',
    membersDesc: 'Manage member profiles and loyalty data.',
    getMember: 'Get Member',
    getMemberDesc: 'Retrieves a member profile by email address.',
    updateMember: 'Update Member',
    updateMemberDesc: 'Updates a member\'s profile information.',
    // Webhooks
    webhooksTitle: 'Webhooks',
    webhooksDesc: 'Webhooks allow you to receive real-time notifications about events in your Nexus account. Configure webhook endpoints in your Dashboard.',
    webhookEvents: 'Available Events',
    purchaseCompleted: 'purchase.completed — A purchase was successfully completed',
    purchaseFailed: 'purchase.failed — A purchase attempt failed',
    memberCreated: 'member.created — A new member was registered',
    offerRedeemed: 'offer.redeemed — An offer was redeemed by a member',
    webhookPayload: 'Webhook Payload',
    // Errors
    errorsTitle: 'Error Handling',
    errorsDesc: 'Nexus uses standard HTTP status codes to indicate the success or failure of an API request.',
    code: 'Code',
    meaning: 'Meaning',
    description: 'Description',
    // Rate Limiting
    rateLimitTitle: 'Rate Limiting',
    rateLimitDesc: 'The API is rate limited to ensure fair usage. Default limits are 100 requests per minute per API key. Rate limit headers are included in every response.',
    // SDKs
    sdksTitle: 'SDKs & Libraries',
    sdksDesc: 'Use our official SDKs to integrate faster.',
    jsSDK: 'JavaScript / Node.js',
    pythonSDK: 'Python',
    directHTTP: 'Direct HTTP',
  },
  he: {
    pageTitle: 'תיעוד API',
    pageSubtitle: 'כל מה שצריך כדי לשלב תשלומים ונאמנות של Nexus באפליקציה שלך.',
    gettingStarted: 'התחלה',
    authentication: 'אימות',
    baseUrl: 'כתובת בסיס',
    endpoints: 'נקודות קצה',
    purchases: 'רכישות',
    offers: 'מבצעים',
    members: 'חברים',
    webhooks: 'Webhooks',
    errors: 'טיפול בשגיאות',
    rateLimiting: 'מגבלת קצב',
    sdks: 'SDKs וספריות',
    heroLabel: 'תיעוד למפתחים',
    heroTitle: 'בנו עם ה-API של Nexus',
    heroSubtitle: 'שלבו תשלומים, תוכניות נאמנות וניהול חברים באפליקציה שלכם עם ה-API ה-RESTful שלנו.',
    quickStartBtn: 'מדריך התחלה מהירה',
    fullRefBtn: 'מדריך מלא',
    gettingStartedTitle: 'התחלה',
    gettingStartedDesc: 'ה-API של Nexus מאורגן סביב REST. ה-API שלנו מקבל גוף בקשה בפורמט JSON, מחזיר תגובות בפורמט JSON, ומשתמש בקודי תגובה סטנדרטיים של HTTP ואימות.',
    step1Title: 'קבלו את מפתחות ה-API',
    step1Desc: 'הירשמו לחשבון Nexus ונווטו ללוח הבקרה כדי למצוא את מפתחות ה-API שלכם.',
    step2Title: 'התקינו SDK',
    step2Desc: 'השתמשו ב-SDKs הרשמיים שלנו ל-JavaScript, Python, או בצעו בקשות HTTP ישירות.',
    step3Title: 'בצעו את הבקשה הראשונה',
    step3Desc: 'בדקו את ה-API עם בקשה פשוטה כדי לאמת את האינטגרציה שלכם.',
    authTitle: 'אימות',
    authDesc: 'ה-API של Nexus משתמש ב-Bearer tokens לאימות. כללו את מפתח ה-API שלכם בכותרת Authorization של כל בקשה.',
    authWarning: 'שמרו על מפתחות ה-API שלכם. אל תשתפו אותם בקוד צד לקוח או במאגרים ציבוריים.',
    baseUrlTitle: 'כתובת בסיס',
    baseUrlDesc: 'כל בקשות ה-API צריכות להיעשות לכתובת הבסיס הבאה:',
    purchasesTitle: 'רכישות',
    purchasesDesc: 'יצירה וניהול של סשנים של רכישות לעיבוד תשלומים.',
    createPurchase: 'יצירת רכישה',
    createPurchaseDesc: 'יוצר סשן רכישה חדש. מחזיר כתובת URL להפניית הלקוח להשלמת התשלום.',
    requestBody: 'גוף הבקשה',
    response: 'תגובה',
    offersTitle: 'מבצעים',
    offersDesc: 'שליפה וניהול של מבצעים זמינים עבור הדיירים שלכם.',
    listOffers: 'רשימת מבצעים',
    listOffersDesc: 'מחזיר רשימה של כל המבצעים הפעילים עבור הדייר המצוין.',
    getOffer: 'קבלת מבצע',
    getOfferDesc: 'שולף מבצע ספציפי לפי מזהה.',
    membersTitle: 'חברים',
    membersDesc: 'ניהול פרופילי חברים ונתוני נאמנות.',
    getMember: 'קבלת חבר',
    getMemberDesc: 'שולף פרופיל חבר לפי כתובת אימייל.',
    updateMember: 'עדכון חבר',
    updateMemberDesc: 'מעדכן את פרטי הפרופיל של חבר.',
    webhooksTitle: 'Webhooks',
    webhooksDesc: 'Webhooks מאפשרים לכם לקבל התראות בזמן אמת על אירועים בחשבון ה-Nexus שלכם. הגדירו נקודות קצה של webhook בלוח הבקרה.',
    webhookEvents: 'אירועים זמינים',
    purchaseCompleted: 'purchase.completed — רכישה הושלמה בהצלחה',
    purchaseFailed: 'purchase.failed — ניסיון רכישה נכשל',
    memberCreated: 'member.created — חבר חדש נרשם',
    offerRedeemed: 'offer.redeemed — מבצע מומש על ידי חבר',
    webhookPayload: 'מבנה Webhook',
    errorsTitle: 'טיפול בשגיאות',
    errorsDesc: 'Nexus משתמש בקודי סטטוס HTTP סטנדרטיים כדי לציין את הצלחת או כישלון בקשת API.',
    code: 'קוד',
    meaning: 'משמעות',
    description: 'תיאור',
    rateLimitTitle: 'מגבלת קצב',
    rateLimitDesc: 'ה-API מוגבל בקצב כדי להבטיח שימוש הוגן. מגבלת ברירת המחדל היא 100 בקשות לדקה למפתח API. כותרות מגבלת קצב כלולות בכל תגובה.',
    sdksTitle: 'SDKs וספריות',
    sdksDesc: 'השתמשו ב-SDKs הרשמיים שלנו לאינטגרציה מהירה יותר.',
    jsSDK: 'JavaScript / Node.js',
    pythonSDK: 'Python',
    directHTTP: 'HTTP ישיר',
  },
};

// ─── Code examples ─────────────────────────────────────────
const codeExamples = {
  auth: `curl -X GET 'https://api.nexus.com/v1/offers' \\
  -H 'Authorization: Bearer nx_live_abc123...' \\
  -H 'Content-Type: application/json'`,

  createPurchaseReq: `curl -X POST 'https://api.nexus.com/v1/purchases' \\
  -H 'Authorization: Bearer nx_live_abc123...' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "tenantId": "tenant_001",
    "offerId": "offer_12345",
    "email": "customer@example.com",
    "amount": 250,
    "currency": "ILS",
    "receiptDetails": {
      "fullName": "John Doe",
      "email": "customer@example.com",
      "phone": "0501234567",
      "notes": "Gift purchase"
    }
  }'`,

  createPurchaseRes: `{
  "id": "purch_8xK2mN4qR7",
  "status": "pending",
  "sessionUrl": "https://pay.nexus.com/s/purch_8xK2mN4qR7",
  "amount": 250,
  "currency": "ILS",
  "expiresAt": "2026-03-08T12:30:00Z"
}`,

  listOffers: `curl -X GET 'https://api.nexus.com/v1/offers?tenantId=tenant_001' \\
  -H 'Authorization: Bearer nx_live_abc123...'`,

  listOffersRes: `{
  "data": [
    {
      "id": "offer_12345",
      "title": "20% Off Coffee",
      "description": "Get 20% off at partner cafes",
      "type": "discount",
      "value": 20,
      "expiresAt": "2026-06-01T00:00:00Z",
      "active": true
    }
  ],
  "total": 1,
  "page": 1
}`,

  getOffer: `curl -X GET 'https://api.nexus.com/v1/offers/offer_12345' \\
  -H 'Authorization: Bearer nx_live_abc123...'`,

  getMember: `curl -X GET 'https://api.nexus.com/v1/members?email=customer@example.com' \\
  -H 'Authorization: Bearer nx_live_abc123...'`,

  getMemberRes: `{
  "id": "mem_4jT9kL2pQ5",
  "email": "customer@example.com",
  "fullName": "John Doe",
  "points": 1250,
  "tier": "gold",
  "joinedAt": "2025-01-15T10:00:00Z"
}`,

  updateMember: `curl -X PATCH 'https://api.nexus.com/v1/members/mem_4jT9kL2pQ5' \\
  -H 'Authorization: Bearer nx_live_abc123...' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "fullName": "John D.",
    "metadata": { "vip": true }
  }'`,

  webhookPayload: `{
  "id": "evt_2nR5tP8wK3",
  "type": "purchase.completed",
  "createdAt": "2026-03-08T10:15:00Z",
  "data": {
    "purchaseId": "purch_8xK2mN4qR7",
    "amount": 250,
    "currency": "ILS",
    "memberId": "mem_4jT9kL2pQ5"
  }
}`,

  jsInstall: `npm install @nexus/sdk`,
  jsUsage: `const Nexus = require('@nexus/sdk');

const nexus = new Nexus('nx_live_abc123...');

// Create a purchase
const purchase = await nexus.purchases.create({
  tenantId: 'tenant_001',
  offerId: 'offer_12345',
  email: 'customer@example.com',
  amount: 250,
  currency: 'ILS',
});

console.log(purchase.sessionUrl);`,

  pythonInstall: `pip install nexus-sdk`,
  pythonUsage: `import nexus

client = nexus.Client("nx_live_abc123...")

# Create a purchase
purchase = client.purchases.create(
    tenant_id="tenant_001",
    offer_id="offer_12345",
    email="customer@example.com",
    amount=250,
    currency="ILS",
)

print(purchase.session_url)`,
};

const errorCodes = [
  { code: '200', meaning: 'OK', desc_en: 'Request succeeded', desc_he: 'הבקשה הצליחה' },
  { code: '201', meaning: 'Created', desc_en: 'Resource created successfully', desc_he: 'המשאב נוצר בהצלחה' },
  { code: '400', meaning: 'Bad Request', desc_en: 'Invalid request parameters', desc_he: 'פרמטרים לא תקינים' },
  { code: '401', meaning: 'Unauthorized', desc_en: 'Invalid or missing API key', desc_he: 'מפתח API חסר או לא תקין' },
  { code: '403', meaning: 'Forbidden', desc_en: 'Insufficient permissions', desc_he: 'הרשאות לא מספיקות' },
  { code: '404', meaning: 'Not Found', desc_en: 'Resource not found', desc_he: 'המשאב לא נמצא' },
  { code: '429', meaning: 'Too Many Requests', desc_en: 'Rate limit exceeded', desc_he: 'חריגה ממגבלת הקצב' },
  { code: '500', meaning: 'Server Error', desc_en: 'Internal server error', desc_he: 'שגיאת שרת פנימית' },
];

// ─── Main component ────────────────────────────────────────
export default function ApiDocsPage() {
  const { language, direction } = useLanguage();
  const tx = t[language as 'en' | 'he'] || t.en;
  const isRTL = direction === 'rtl';
  const [activeSection, setActiveSection] = useState('getting-started');

  useScrollReveal();

  useEffect(() => {
    document.title = `${tx.pageTitle} | Nexus`;
  }, [tx.pageTitle]);

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Track active section on scroll
  useEffect(() => {
    const sections = document.querySelectorAll('[data-section]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-100px 0px -60% 0px', threshold: 0 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const sidebarSections = [
    { id: 'getting-started', label: tx.gettingStarted },
    { id: 'authentication', label: tx.authentication },
    { id: 'base-url', label: tx.baseUrl },
    { id: 'purchases', label: tx.purchases, indent: true },
    { id: 'offers', label: tx.offers, indent: true },
    { id: 'members', label: tx.members, indent: true },
    { id: 'webhooks', label: tx.webhooks },
    { id: 'errors', label: tx.errors },
    { id: 'rate-limiting', label: tx.rateLimiting },
    { id: 'sdks', label: tx.sdks },
  ];

  return (
    <div className="min-h-screen bg-white" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Navbar variant="light" />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 bg-gradient-to-b from-stripe-blue to-[#0c1e33] overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-stripe-purple/15 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/80 text-sm mb-6">
            <Code className="w-4 h-4" />
            {tx.heroLabel}
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
            {tx.heroTitle}
          </h1>
          <p className="text-lg text-white/70 max-w-2xl mx-auto mb-8">
            {tx.heroSubtitle}
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => scrollTo('getting-started')}
              className="px-6 py-3 rounded-full bg-stripe-purple text-white font-medium hover:bg-stripe-purple/90 transition-colors flex items-center gap-2"
            >
              {tx.quickStartBtn}
              <ChevronRight className="w-4 h-4" />
            </button>
            <a
              href="https://nexus-api-docs-production.up.railway.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-full bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
            >
              {tx.fullRefBtn}
            </a>
          </div>
        </div>
      </section>

      {/* ── Content with sidebar ─────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <nav className="sticky top-28 space-y-1">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-3">
                {tx.pageTitle}
              </h3>
              {sidebarSections.map((s) => (
                <SidebarItem
                  key={s.id}
                  id={s.id}
                  label={s.label}
                  active={activeSection === s.id}
                  onClick={scrollTo}
                  indent={s.indent}
                />
              ))}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 max-w-3xl">

            {/* Getting Started */}
            <section id="getting-started" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.gettingStartedTitle}</h2>
              <p className="text-slate-600 mb-8 leading-relaxed">{tx.gettingStartedDesc}</p>

              <div className="grid gap-6 md:grid-cols-3 mb-8">
                {[
                  { icon: Lock, num: '1', title: tx.step1Title, desc: tx.step1Desc },
                  { icon: Terminal, num: '2', title: tx.step2Title, desc: tx.step2Desc },
                  { icon: Zap, num: '3', title: tx.step3Title, desc: tx.step3Desc },
                ].map((step) => (
                  <div key={step.num} className="p-5 rounded-xl border border-slate-200 hover:border-stripe-purple/30 hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-stripe-purple/10 flex items-center justify-center text-stripe-purple font-bold text-sm">
                        {step.num}
                      </div>
                      <step.icon className="w-5 h-5 text-stripe-purple" />
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">{step.title}</h3>
                    <p className="text-sm text-slate-500">{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Authentication */}
            <section id="authentication" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.authTitle}</h2>
              <p className="text-slate-600 mb-6 leading-relaxed">{tx.authDesc}</p>

              <CodeBlock code={codeExamples.auth} language="bash" />

              <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
                <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">{tx.authWarning}</p>
              </div>
            </section>

            {/* Base URL */}
            <section id="base-url" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.baseUrlTitle}</h2>
              <p className="text-slate-600 mb-6">{tx.baseUrlDesc}</p>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <code className="text-lg font-mono text-stripe-purple font-semibold">
                  https://api.nexus.com/v1
                </code>
              </div>
            </section>

            {/* Purchases */}
            <section id="purchases" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-3xl font-bold text-slate-900">{tx.purchasesTitle}</h2>
              </div>
              <p className="text-slate-600 mb-8">{tx.purchasesDesc}</p>

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <MethodBadge method="POST" />
                  <code className="text-sm font-mono text-slate-700">/v1/purchases</code>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{tx.createPurchase}</h3>
                <p className="text-slate-600 mb-4">{tx.createPurchaseDesc}</p>

                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{tx.requestBody}</h4>
                <CodeBlock code={codeExamples.createPurchaseReq} language="bash" />

                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-6 mb-3">{tx.response}</h4>
                <CodeBlock code={codeExamples.createPurchaseRes} language="json" />
              </div>
            </section>

            {/* Offers */}
            <section id="offers" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.offersTitle}</h2>
              <p className="text-slate-600 mb-8">{tx.offersDesc}</p>

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <MethodBadge method="GET" />
                  <code className="text-sm font-mono text-slate-700">/v1/offers</code>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{tx.listOffers}</h3>
                <p className="text-slate-600 mb-4">{tx.listOffersDesc}</p>
                <CodeBlock code={codeExamples.listOffers} language="bash" />
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-6 mb-3">{tx.response}</h4>
                <CodeBlock code={codeExamples.listOffersRes} language="json" />
              </div>

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <MethodBadge method="GET" />
                  <code className="text-sm font-mono text-slate-700">/v1/offers/:id</code>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{tx.getOffer}</h3>
                <p className="text-slate-600 mb-4">{tx.getOfferDesc}</p>
                <CodeBlock code={codeExamples.getOffer} language="bash" />
              </div>
            </section>

            {/* Members */}
            <section id="members" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.membersTitle}</h2>
              <p className="text-slate-600 mb-8">{tx.membersDesc}</p>

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <MethodBadge method="GET" />
                  <code className="text-sm font-mono text-slate-700">/v1/members</code>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{tx.getMember}</h3>
                <p className="text-slate-600 mb-4">{tx.getMemberDesc}</p>
                <CodeBlock code={codeExamples.getMember} language="bash" />
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-6 mb-3">{tx.response}</h4>
                <CodeBlock code={codeExamples.getMemberRes} language="json" />
              </div>

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <MethodBadge method="PATCH" />
                  <code className="text-sm font-mono text-slate-700">/v1/members/:id</code>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{tx.updateMember}</h3>
                <p className="text-slate-600 mb-4">{tx.updateMemberDesc}</p>
                <CodeBlock code={codeExamples.updateMember} language="bash" />
              </div>
            </section>

            {/* Webhooks */}
            <section id="webhooks" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.webhooksTitle}</h2>
              <p className="text-slate-600 mb-6">{tx.webhooksDesc}</p>

              <h3 className="text-lg font-semibold text-slate-900 mb-4">{tx.webhookEvents}</h3>
              <ul className="space-y-2 mb-8">
                {[tx.purchaseCompleted, tx.purchaseFailed, tx.memberCreated, tx.offerRedeemed].map((evt, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-stripe-purple flex-shrink-0" />
                    <code className="text-slate-700">{evt}</code>
                  </li>
                ))}
              </ul>

              <h3 className="text-lg font-semibold text-slate-900 mb-3">{tx.webhookPayload}</h3>
              <CodeBlock code={codeExamples.webhookPayload} language="json" />
            </section>

            {/* Error Handling */}
            <section id="errors" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.errorsTitle}</h2>
              <p className="text-slate-600 mb-6">{tx.errorsDesc}</p>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-start px-4 py-3 font-semibold text-slate-700">{tx.code}</th>
                      <th className="text-start px-4 py-3 font-semibold text-slate-700">{tx.meaning}</th>
                      <th className="text-start px-4 py-3 font-semibold text-slate-700">{tx.description}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorCodes.map((err) => (
                      <tr key={err.code} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3">
                          <code className={`font-mono font-bold ${
                            err.code.startsWith('2') ? 'text-green-600' :
                            err.code.startsWith('4') ? 'text-amber-600' : 'text-red-600'
                          }`}>{err.code}</code>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{err.meaning}</td>
                        <td className="px-4 py-3 text-slate-500">{language === 'he' ? err.desc_he : err.desc_en}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Rate Limiting */}
            <section id="rate-limiting" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.rateLimitTitle}</h2>
              <p className="text-slate-600 mb-6">{tx.rateLimitDesc}</p>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="grid gap-4 md:grid-cols-3 text-sm">
                  <div>
                    <span className="block font-semibold text-slate-700 mb-1">X-RateLimit-Limit</span>
                    <span className="text-slate-500">100</span>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-700 mb-1">X-RateLimit-Remaining</span>
                    <span className="text-slate-500">98</span>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-700 mb-1">X-RateLimit-Reset</span>
                    <span className="text-slate-500">1709892000</span>
                  </div>
                </div>
              </div>
            </section>

            {/* SDKs */}
            <section id="sdks" data-section className="mb-20 scroll-reveal scroll-reveal-delay-1">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{tx.sdksTitle}</h2>
              <p className="text-slate-600 mb-8">{tx.sdksDesc}</p>

              <div className="space-y-8">
                {/* JavaScript */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-5 h-5 text-yellow-500" />
                    <h3 className="text-lg font-semibold text-slate-900">{tx.jsSDK}</h3>
                  </div>
                  <CodeBlock code={codeExamples.jsInstall} language="bash" />
                  <div className="mt-3">
                    <CodeBlock code={codeExamples.jsUsage} language="javascript" />
                  </div>
                </div>

                {/* Python */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Book className="w-5 h-5 text-blue-500" />
                    <h3 className="text-lg font-semibold text-slate-900">{tx.pythonSDK}</h3>
                  </div>
                  <CodeBlock code={codeExamples.pythonInstall} language="bash" />
                  <div className="mt-3">
                    <CodeBlock code={codeExamples.pythonUsage} language="python" />
                  </div>
                </div>
              </div>
            </section>

          </main>
        </div>
      </div>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
}
