import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const sectionStyle = "mb-10";
const h2Style = "text-xl font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200";
const h3Style = "text-base font-semibold text-slate-800 mt-5 mb-2";
const pStyle = "text-sm text-slate-700 leading-relaxed mb-3";
const ulStyle = "list-disc list-inside text-sm text-slate-700 leading-relaxed space-y-1 mb-3 ps-4";
const linkStyle = "text-indigo-600 hover:underline";

export default function PrivacyPolicyPage() {
  const { direction } = useLanguage();
  const isHe = direction === 'rtl';

  return (
    <div dir={direction} className="min-h-screen bg-white">
      <Navbar variant="dark" />

      <main className="max-w-4xl mx-auto px-6 pt-32 pb-24">
        {isHe ? <HebrewContent /> : <EnglishContent />}
      </main>

      <Footer />
    </div>
  );
}

function HebrewContent() {
  return (
    <article className="max-w-none text-right" dir="rtl">
      <h1 className="text-3xl font-bold text-slate-900 mb-1">מדיניות פרטיות ועוגיות – Nexus</h1>
      <p className="text-sm text-slate-400 mb-10">עודכן לאחרונה: 7 במרץ 2026</p>

      <div className={sectionStyle}>
        <p className={pStyle}>
          מדיניות פרטיות זו מסבירה כיצד Nexus Consumer Ltd ("החברה", "נקסוס") אוספת, משתמשת, שומרת ומגנה על מידע אישי של משתמשים באתר{' '}
          <a href="https://nexus-payment.com" className={linkStyle}>https://nexus-payment.com</a> ("האתר").
        </p>
        <p className={`${pStyle} font-semibold`}>המדיניות חלה על:</p>
        <ul className={ulStyle}>
          <li>שימוש באתר השיווקי</li>
          <li>קריאת תוכן בבלוג</li>
          <li>יצירת קשר עם החברה</li>
          <li>הרשמה למערכת ניהול (Dashboard)</li>
          <li>שימוש במערכות החברה דרך האתר</li>
        </ul>
        <p className={pStyle}>השימוש באתר מהווה הסכמה למדיניות פרטיות זו.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>1. סוגי מידע שאנו אוספים</h2>
        <p className={pStyle}>אנו עשויים לאסוף מספר סוגי מידע:</p>

        <h3 className={h3Style}>1.1 מידע שהמשתמש מספק באופן יזום:</h3>
        <ul className={ulStyle}>
          <li>שם מלא</li>
          <li>כתובת אימייל</li>
          <li>מספר טלפון</li>
          <li>שם חברה או ארגון</li>
          <li>כל מידע שנשלח דרך טפסי יצירת קשר</li>
        </ul>

        <h3 className={h3Style}>1.2 מידע טכני שנאסף באופן אוטומטי:</h3>
        <ul className={ulStyle}>
          <li>כתובת IP</li>
          <li>סוג דפדפן</li>
          <li>מערכת הפעלה</li>
          <li>סוג מכשיר</li>
          <li>עמודים שנצפו באתר</li>
          <li>זמן שהייה באתר</li>
          <li>מקור ההגעה לאתר</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>2. מטרות השימוש במידע</h2>
        <p className={pStyle}>המידע נאסף לצורך:</p>
        <ul className={ulStyle}>
          <li>תפעול האתר ושיפור חוויית המשתמש</li>
          <li>ניתוח שימוש באתר ובתכניו</li>
          <li>יצירת קשר עם משתמשים שפנו לחברה</li>
          <li>מתן גישה למערכת הניהול ללקוחות</li>
          <li>שיפור השירותים והמוצרים של החברה</li>
          <li>אבטחת מערכות החברה</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>3. שימוש בכלי אנליטיקה</h2>
        <p className={pStyle}>האתר עשוי להשתמש בכלי אנליטיקה לצורך ניתוח תנועת משתמשים באתר.</p>
        <p className={pStyle}>כלים אלה עשויים לאסוף מידע סטטיסטי כגון:</p>
        <ul className={ulStyle}>
          <li>דפי נחיתה</li>
          <li>משך ביקור</li>
          <li>מקור תנועה</li>
          <li>אינטראקציות עם האתר</li>
        </ul>
        <p className={pStyle}>המידע משמש לניתוח ביצועי האתר ושיפור השירות.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>4. שמירת מידע</h2>
        <p className={pStyle}>החברה שומרת מידע אישי רק למשך הזמן הדרוש למטרות שלשמן נאסף המידע, או בהתאם לחובות חוקיות החלות עליה.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>5. שיתוף מידע עם צדדים שלישיים</h2>
        <p className={pStyle}>החברה אינה מוכרת מידע אישי.</p>
        <p className={pStyle}>עם זאת, ייתכן שמידע יועבר לספקי שירות המסייעים בתפעול האתר, כגון:</p>
        <ul className={ulStyle}>
          <li>שירותי אחסון</li>
          <li>שירותי דיוור</li>
          <li>שירותי אנליטיקה</li>
          <li>שירותי אבטחת מידע</li>
        </ul>
        <p className={pStyle}>ספקים אלו מחויבים להשתמש במידע רק לצורך מתן השירותים לחברה.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>6. אבטחת מידע</h2>
        <p className={pStyle}>החברה נוקטת באמצעים סבירים להגנה על מידע המשתמשים, כולל שימוש באמצעי אבטחה טכנולוגיים וארגוניים.</p>
        <p className={pStyle}>עם זאת, אין מערכת אינטרנטית שיכולה להיות מוגנת לחלוטין מפני חדירות.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>7. זכויות משתמשים</h2>
        <p className={pStyle}>משתמשים רשאים לפנות לחברה בבקשה:</p>
        <ul className={ulStyle}>
          <li>לעיין במידע שנשמר עליהם</li>
          <li>לתקן מידע שגוי</li>
          <li>לבקש מחיקת מידע במקרים המתאימים</li>
        </ul>
        <p className={pStyle}>בקשות ניתן לשלוח לכתובת הדוא"ל של החברה.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>8. מדיניות עוגיות (Cookies)</h2>
        <p className={pStyle}>האתר עושה שימוש בעוגיות (Cookies) ובטכנולוגיות דומות לצורך:</p>
        <ul className={ulStyle}>
          <li>תפעול תקין של האתר</li>
          <li>שמירת העדפות משתמש</li>
          <li>ניתוח תנועת משתמשים</li>
          <li>שיפור חוויית המשתמש</li>
        </ul>
        <p className={pStyle}>עוגיות הן קבצי טקסט קטנים הנשמרים בדפדפן של המשתמש.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>9. סוגי עוגיות</h2>
        <p className={pStyle}>ייתכן שימוש במספר סוגי עוגיות:</p>
        <h3 className={h3Style}>9.1 עוגיות חיוניות</h3>
        <p className={pStyle}>מאפשרות את פעילות האתר הבסיסית.</p>
        <h3 className={h3Style}>9.2 עוגיות אנליטיקה</h3>
        <p className={pStyle}>משמשות לניתוח שימוש באתר.</p>
        <h3 className={h3Style}>9.3 עוגיות פונקציונליות</h3>
        <p className={pStyle}>שומרות העדפות משתמש.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>10. ניהול עוגיות</h2>
        <p className={pStyle}>משתמשים יכולים לשלוט בשימוש בעוגיות דרך הגדרות הדפדפן שלהם.</p>
        <p className={pStyle}>ניתן:</p>
        <ul className={ulStyle}>
          <li>לחסום עוגיות</li>
          <li>למחוק עוגיות קיימות</li>
          <li>לקבל התראה בעת יצירת עוגיה</li>
        </ul>
        <p className={pStyle}>ייתכן שחסימת עוגיות תפגע בחלק מפונקציות האתר.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>11. שינויים במדיניות הפרטיות</h2>
        <p className={pStyle}>החברה רשאית לעדכן מדיניות זו מעת לעת.</p>
        <p className={pStyle}>הגרסה המעודכנת תפורסם באתר.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>12. יצירת קשר</h2>
        <p className={pStyle}>לשאלות בנוגע למדיניות הפרטיות ניתן לפנות:</p>
        <p className={pStyle}>Email: <a href="mailto:support@nexus-payment.com" className={linkStyle}>support@nexus-payment.com</a></p>
      </div>
    </article>
  );
}

function EnglishContent() {
  return (
    <article className="max-w-none">
      <h1 className="text-3xl font-bold text-slate-900 mb-1">Privacy Policy & Cookies – Nexus</h1>
      <p className="text-sm text-slate-400 mb-10">Last updated: March 7, 2026</p>

      <div className={sectionStyle}>
        <p className={pStyle}>
          This privacy policy explains how Nexus Consumer Ltd ("the Company", "Nexus") collects, uses, stores and protects personal information of users on the website{' '}
          <a href="https://nexus-payment.com" className={linkStyle}>https://nexus-payment.com</a> ("the Website").
        </p>
        <p className={`${pStyle} font-semibold`}>This policy applies to:</p>
        <ul className={ulStyle}>
          <li>Use of the marketing website</li>
          <li>Reading blog content</li>
          <li>Contacting the company</li>
          <li>Registering for the management system (Dashboard)</li>
          <li>Using the company's systems through the website</li>
        </ul>
        <p className={pStyle}>Using the website constitutes agreement to this privacy policy.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>1. Types of Information We Collect</h2>
        <p className={pStyle}>We may collect several types of information:</p>

        <h3 className={h3Style}>1.1 Information provided voluntarily by the user:</h3>
        <ul className={ulStyle}>
          <li>Full name</li>
          <li>Email address</li>
          <li>Phone number</li>
          <li>Company or organization name</li>
          <li>Any information submitted through contact forms</li>
        </ul>

        <h3 className={h3Style}>1.2 Technical information collected automatically:</h3>
        <ul className={ulStyle}>
          <li>IP address</li>
          <li>Browser type</li>
          <li>Operating system</li>
          <li>Device type</li>
          <li>Pages viewed on the website</li>
          <li>Time spent on the website</li>
          <li>Referral source</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>2. Purposes of Information Use</h2>
        <p className={pStyle}>Information is collected for:</p>
        <ul className={ulStyle}>
          <li>Operating the website and improving user experience</li>
          <li>Analyzing website and content usage</li>
          <li>Contacting users who have reached out to the company</li>
          <li>Providing access to the management system for clients</li>
          <li>Improving the company's services and products</li>
          <li>Securing the company's systems</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>3. Use of Analytics Tools</h2>
        <p className={pStyle}>The website may use analytics tools to analyze user traffic.</p>
        <p className={pStyle}>These tools may collect statistical information such as:</p>
        <ul className={ulStyle}>
          <li>Landing pages</li>
          <li>Visit duration</li>
          <li>Traffic source</li>
          <li>Interactions with the website</li>
        </ul>
        <p className={pStyle}>The information is used for website performance analysis and service improvement.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>4. Information Retention</h2>
        <p className={pStyle}>The company retains personal information only for the period necessary for the purposes for which it was collected, or in accordance with applicable legal obligations.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>5. Sharing Information with Third Parties</h2>
        <p className={pStyle}>The company does not sell personal information.</p>
        <p className={pStyle}>However, information may be transferred to service providers who assist in operating the website, such as:</p>
        <ul className={ulStyle}>
          <li>Hosting services</li>
          <li>Mailing services</li>
          <li>Analytics services</li>
          <li>Information security services</li>
        </ul>
        <p className={pStyle}>These providers are required to use the information only for the purpose of providing services to the company.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>6. Information Security</h2>
        <p className={pStyle}>The company takes reasonable measures to protect user information, including the use of technological and organizational security measures.</p>
        <p className={pStyle}>However, no internet system can be completely protected against intrusions.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>7. User Rights</h2>
        <p className={pStyle}>Users may contact the company to request:</p>
        <ul className={ulStyle}>
          <li>Review of information stored about them</li>
          <li>Correction of inaccurate information</li>
          <li>Deletion of information in appropriate cases</li>
        </ul>
        <p className={pStyle}>Requests can be sent to the company's email address.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>8. Cookie Policy</h2>
        <p className={pStyle}>The website uses cookies and similar technologies for:</p>
        <ul className={ulStyle}>
          <li>Proper website operation</li>
          <li>Saving user preferences</li>
          <li>Analyzing user traffic</li>
          <li>Improving user experience</li>
        </ul>
        <p className={pStyle}>Cookies are small text files stored in the user's browser.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>9. Types of Cookies</h2>
        <p className={pStyle}>Several types of cookies may be used:</p>
        <h3 className={h3Style}>9.1 Essential Cookies</h3>
        <p className={pStyle}>Enable basic website functionality.</p>
        <h3 className={h3Style}>9.2 Analytics Cookies</h3>
        <p className={pStyle}>Used to analyze website usage.</p>
        <h3 className={h3Style}>9.3 Functional Cookies</h3>
        <p className={pStyle}>Save user preferences.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>10. Managing Cookies</h2>
        <p className={pStyle}>Users can control cookie usage through their browser settings.</p>
        <p className={pStyle}>You can:</p>
        <ul className={ulStyle}>
          <li>Block cookies</li>
          <li>Delete existing cookies</li>
          <li>Receive a notification when a cookie is created</li>
        </ul>
        <p className={pStyle}>Blocking cookies may affect some website functions.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>11. Changes to the Privacy Policy</h2>
        <p className={pStyle}>The company may update this policy from time to time.</p>
        <p className={pStyle}>The updated version will be published on the website.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>12. Contact</h2>
        <p className={pStyle}>For questions regarding the privacy policy, please contact:</p>
        <p className={pStyle}>Email: <a href="mailto:support@nexus-payment.com" className={linkStyle}>support@nexus-payment.com</a></p>
      </div>
    </article>
  );
}
