import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function PrivacyPolicyPage() {
  const { direction } = useLanguage();
  const isHe = direction === 'rtl';

  return (
    <div dir={direction} className="min-h-screen bg-white">
      <Navbar />

      <main className="max-w-4xl mx-auto px-6 pt-32 pb-24">
        {isHe ? <HebrewContent /> : <EnglishContent />}
      </main>

      <Footer />
    </div>
  );
}

function HebrewContent() {
  return (
    <article className="prose prose-slate max-w-none text-right" dir="rtl">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">מדיניות פרטיות ועוגיות – Nexus</h1>
      <p className="text-sm text-slate-500 mb-8">עודכן לאחרונה: 7 במרץ 2026</p>

      <p>
        מדיניות פרטיות זו מסבירה כיצד Nexus Consumer Ltd ("החברה", "נקסוס") אוספת, משתמשת, שומרת ומגנה על מידע אישי של משתמשים באתר{' '}
        <a href="https://nexus-payment.com" className="text-indigo-600 hover:underline">https://nexus-payment.com</a> ("האתר").
      </p>

      <p>המדיניות חלה על:</p>
      <ul>
        <li>שימוש באתר השיווקי</li>
        <li>קריאת תוכן בבלוג</li>
        <li>יצירת קשר עם החברה</li>
        <li>הרשמה למערכת ניהול (Dashboard)</li>
        <li>שימוש במערכות החברה דרך האתר</li>
      </ul>

      <p>השימוש באתר מהווה הסכמה למדיניות פרטיות זו.</p>

      <h2>1. סוגי מידע שאנו אוספים</h2>
      <p>אנו עשויים לאסוף מספר סוגי מידע:</p>

      <h3>מידע שהמשתמש מספק באופן יזום:</h3>
      <ul>
        <li>שם מלא</li>
        <li>כתובת אימייל</li>
        <li>מספר טלפון</li>
        <li>שם חברה או ארגון</li>
        <li>כל מידע שנשלח דרך טפסי יצירת קשר</li>
      </ul>

      <h3>מידע טכני שנאסף באופן אוטומטי:</h3>
      <ul>
        <li>כתובת IP</li>
        <li>סוג דפדפן</li>
        <li>מערכת הפעלה</li>
        <li>סוג מכשיר</li>
        <li>עמודים שנצפו באתר</li>
        <li>זמן שהייה באתר</li>
        <li>מקור ההגעה לאתר</li>
      </ul>

      <h2>2. מטרות השימוש במידע</h2>
      <p>המידע נאסף לצורך:</p>
      <ul>
        <li>תפעול האתר ושיפור חוויית המשתמש</li>
        <li>ניתוח שימוש באתר ובתכניו</li>
        <li>יצירת קשר עם משתמשים שפנו לחברה</li>
        <li>מתן גישה למערכת הניהול ללקוחות</li>
        <li>שיפור השירותים והמוצרים של החברה</li>
        <li>אבטחת מערכות החברה</li>
      </ul>

      <h2>3. שימוש בכלי אנליטיקה</h2>
      <p>האתר עשוי להשתמש בכלי אנליטיקה לצורך ניתוח תנועת משתמשים באתר.</p>
      <p>כלים אלה עשויים לאסוף מידע סטטיסטי כגון:</p>
      <ul>
        <li>דפי נחיתה</li>
        <li>משך ביקור</li>
        <li>מקור תנועה</li>
        <li>אינטראקציות עם האתר</li>
      </ul>
      <p>המידע משמש לניתוח ביצועי האתר ושיפור השירות.</p>

      <h2>4. שמירת מידע</h2>
      <p>החברה שומרת מידע אישי רק למשך הזמן הדרוש למטרות שלשמן נאסף המידע, או בהתאם לחובות חוקיות החלות עליה.</p>

      <h2>5. שיתוף מידע עם צדדים שלישיים</h2>
      <p>החברה אינה מוכרת מידע אישי.</p>
      <p>עם זאת, ייתכן שמידע יועבר לספקי שירות המסייעים בתפעול האתר, כגון:</p>
      <ul>
        <li>שירותי אחסון</li>
        <li>שירותי דיוור</li>
        <li>שירותי אנליטיקה</li>
        <li>שירותי אבטחת מידע</li>
      </ul>
      <p>ספקים אלו מחויבים להשתמש במידע רק לצורך מתן השירותים לחברה.</p>

      <h2>6. אבטחת מידע</h2>
      <p>החברה נוקטת באמצעים סבירים להגנה על מידע המשתמשים, כולל שימוש באמצעי אבטחה טכנולוגיים וארגוניים.</p>
      <p>עם זאת, אין מערכת אינטרנטית שיכולה להיות מוגנת לחלוטין מפני חדירות.</p>

      <h2>7. זכויות משתמשים</h2>
      <p>משתמשים רשאים לפנות לחברה בבקשה:</p>
      <ul>
        <li>לעיין במידע שנשמר עליהם</li>
        <li>לתקן מידע שגוי</li>
        <li>לבקש מחיקת מידע במקרים המתאימים</li>
      </ul>
      <p>בקשות ניתן לשלוח לכתובת הדוא"ל של החברה.</p>

      <h2>8. מדיניות עוגיות (Cookies)</h2>
      <p>האתר עושה שימוש בעוגיות (Cookies) ובטכנולוגיות דומות לצורך:</p>
      <ul>
        <li>תפעול תקין של האתר</li>
        <li>שמירת העדפות משתמש</li>
        <li>ניתוח תנועת משתמשים</li>
        <li>שיפור חוויית המשתמש</li>
      </ul>
      <p>עוגיות הן קבצי טקסט קטנים הנשמרים בדפדפן של המשתמש.</p>

      <h2>9. סוגי עוגיות</h2>
      <p>ייתכן שימוש במספר סוגי עוגיות:</p>
      <h3>עוגיות חיוניות</h3>
      <p>מאפשרות את פעילות האתר הבסיסית.</p>
      <h3>עוגיות אנליטיקה</h3>
      <p>משמשות לניתוח שימוש באתר.</p>
      <h3>עוגיות פונקציונליות</h3>
      <p>שומרות העדפות משתמש.</p>

      <h2>10. ניהול עוגיות</h2>
      <p>משתמשים יכולים לשלוט בשימוש בעוגיות דרך הגדרות הדפדפן שלהם.</p>
      <p>ניתן:</p>
      <ul>
        <li>לחסום עוגיות</li>
        <li>למחוק עוגיות קיימות</li>
        <li>לקבל התראה בעת יצירת עוגיה</li>
      </ul>
      <p>ייתכן שחסימת עוגיות תפגע בחלק מפונקציות האתר.</p>

      <h2>11. שינויים במדיניות הפרטיות</h2>
      <p>החברה רשאית לעדכן מדיניות זו מעת לעת.</p>
      <p>הגרסה המעודכנת תפורסם באתר.</p>

      <h2>12. יצירת קשר</h2>
      <p>לשאלות בנוגע למדיניות הפרטיות ניתן לפנות:</p>
      <p>Email: <a href="mailto:support@nexus-payment.com" className="text-indigo-600 hover:underline">support@nexus-payment.com</a></p>
    </article>
  );
}

function EnglishContent() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy & Cookies – Nexus</h1>
      <p className="text-sm text-slate-500 mb-8">Last updated: March 7, 2026</p>

      <p>
        This privacy policy explains how Nexus Consumer Ltd ("the Company", "Nexus") collects, uses, stores and protects personal information of users on the website{' '}
        <a href="https://nexus-payment.com" className="text-indigo-600 hover:underline">https://nexus-payment.com</a> ("the Website").
      </p>

      <p>This policy applies to:</p>
      <ul>
        <li>Use of the marketing website</li>
        <li>Reading blog content</li>
        <li>Contacting the company</li>
        <li>Registering for the management system (Dashboard)</li>
        <li>Using the company's systems through the website</li>
      </ul>

      <p>Using the website constitutes agreement to this privacy policy.</p>

      <h2>1. Types of Information We Collect</h2>
      <p>We may collect several types of information:</p>

      <h3>Information provided voluntarily by the user:</h3>
      <ul>
        <li>Full name</li>
        <li>Email address</li>
        <li>Phone number</li>
        <li>Company or organization name</li>
        <li>Any information submitted through contact forms</li>
      </ul>

      <h3>Technical information collected automatically:</h3>
      <ul>
        <li>IP address</li>
        <li>Browser type</li>
        <li>Operating system</li>
        <li>Device type</li>
        <li>Pages viewed on the website</li>
        <li>Time spent on the website</li>
        <li>Referral source</li>
      </ul>

      <h2>2. Purposes of Information Use</h2>
      <p>Information is collected for:</p>
      <ul>
        <li>Operating the website and improving user experience</li>
        <li>Analyzing website and content usage</li>
        <li>Contacting users who have reached out to the company</li>
        <li>Providing access to the management system for clients</li>
        <li>Improving the company's services and products</li>
        <li>Securing the company's systems</li>
      </ul>

      <h2>3. Use of Analytics Tools</h2>
      <p>The website may use analytics tools to analyze user traffic.</p>
      <p>These tools may collect statistical information such as:</p>
      <ul>
        <li>Landing pages</li>
        <li>Visit duration</li>
        <li>Traffic source</li>
        <li>Interactions with the website</li>
      </ul>
      <p>The information is used for website performance analysis and service improvement.</p>

      <h2>4. Information Retention</h2>
      <p>The company retains personal information only for the period necessary for the purposes for which it was collected, or in accordance with applicable legal obligations.</p>

      <h2>5. Sharing Information with Third Parties</h2>
      <p>The company does not sell personal information.</p>
      <p>However, information may be transferred to service providers who assist in operating the website, such as:</p>
      <ul>
        <li>Hosting services</li>
        <li>Mailing services</li>
        <li>Analytics services</li>
        <li>Information security services</li>
      </ul>
      <p>These providers are required to use the information only for the purpose of providing services to the company.</p>

      <h2>6. Information Security</h2>
      <p>The company takes reasonable measures to protect user information, including the use of technological and organizational security measures.</p>
      <p>However, no internet system can be completely protected against intrusions.</p>

      <h2>7. User Rights</h2>
      <p>Users may contact the company to request:</p>
      <ul>
        <li>Review of information stored about them</li>
        <li>Correction of inaccurate information</li>
        <li>Deletion of information in appropriate cases</li>
      </ul>
      <p>Requests can be sent to the company's email address.</p>

      <h2>8. Cookie Policy</h2>
      <p>The website uses cookies and similar technologies for:</p>
      <ul>
        <li>Proper website operation</li>
        <li>Saving user preferences</li>
        <li>Analyzing user traffic</li>
        <li>Improving user experience</li>
      </ul>
      <p>Cookies are small text files stored in the user's browser.</p>

      <h2>9. Types of Cookies</h2>
      <p>Several types of cookies may be used:</p>
      <h3>Essential Cookies</h3>
      <p>Enable basic website functionality.</p>
      <h3>Analytics Cookies</h3>
      <p>Used to analyze website usage.</p>
      <h3>Functional Cookies</h3>
      <p>Save user preferences.</p>

      <h2>10. Managing Cookies</h2>
      <p>Users can control cookie usage through their browser settings.</p>
      <p>You can:</p>
      <ul>
        <li>Block cookies</li>
        <li>Delete existing cookies</li>
        <li>Receive a notification when a cookie is created</li>
      </ul>
      <p>Blocking cookies may affect some website functions.</p>

      <h2>11. Changes to the Privacy Policy</h2>
      <p>The company may update this policy from time to time.</p>
      <p>The updated version will be published on the website.</p>

      <h2>12. Contact</h2>
      <p>For questions regarding the privacy policy, please contact:</p>
      <p>Email: <a href="mailto:support@nexus-payment.com" className="text-indigo-600 hover:underline">support@nexus-payment.com</a></p>
    </article>
  );
}
