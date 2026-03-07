import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const sectionStyle = "mb-10";
const h2Style = "text-xl font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200";
const h3Style = "text-base font-semibold text-slate-800 mt-5 mb-2";
const pStyle = "text-sm text-slate-700 leading-relaxed mb-3";
const ulStyle = "list-disc list-inside text-sm text-slate-700 leading-relaxed space-y-1 mb-3 ps-4";
const linkStyle = "text-indigo-600 hover:underline";

export default function TermsOfUsePage() {
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
      <h1 className="text-3xl font-bold text-slate-900 mb-1">תנאי שימוש באתר Nexus</h1>
      <p className="text-sm text-slate-400 mb-10">עודכן לאחרונה: 7 במרץ 2026</p>

      <div className={sectionStyle}>
        <p className={pStyle}>
          ברוכים הבאים לאתר Nexus בכתובת{' '}
          <a href="https://nexus-payment.com" className={linkStyle}>https://nexus-payment.com</a>{' '}
          (להלן: "האתר"). האתר מופעל על‑ידי Nexus Consumer Ltd (להלן: "החברה", "נקסוס").
        </p>
        <p className={pStyle}>
          תנאי שימוש אלו מסדירים את השימוש באתר, לרבות בתכניו, בבלוג המקצועי, ובגישה למערכות ניהול (Dashboard) המוצעות ללקוחות החברה.
        </p>
        <p className={pStyle}>
          הכניסה לאתר, השימוש בו או הרשמה למערכות המוצעות דרכו מהווים הסכמה מלאה מצד המשתמש לתנאי שימוש אלה.
          אם אינך מסכים לתנאים המפורטים במסמך זה – עליך להימנע משימוש באתר.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>1. מטרת האתר</h2>
        <p className={pStyle}>האתר נועד לספק מידע אודות החברה, מוצריה ושירותיה, לרבות:</p>
        <ul className={ulStyle}>
          <li>מידע שיווקי וטכנולוגי על פתרונות החברה</li>
          <li>מאמרים מקצועיים, מדריכים ותוכן מקצועי בבלוג</li>
          <li>אפשרות ליצירת קשר עם החברה</li>
          <li>גישה למערכת ניהול (Dashboard) עבור לקוחות החברה</li>
          <li>הדגמות, חומרי הדרכה ותכנים מקצועיים</li>
        </ul>
        <p className={pStyle}>המידע באתר ניתן לצורכי מידע בלבד ואינו מהווה הצעה מחייבת, ייעוץ מקצועי, המלצה עסקית או התחייבות מצד החברה.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>2. שימוש מותר באתר</h2>
        <p className={pStyle}>המשתמש מתחייב להשתמש באתר באופן חוקי והוגן בלבד.</p>
        <p className={`${pStyle} font-semibold`}>בין היתר, המשתמש מתחייב שלא:</p>
        <ul className={ulStyle}>
          <li>לבצע ניסיון חדירה למערכות האתר</li>
          <li>להפעיל סקריפטים, בוטים או מערכות אוטומטיות לצורך סריקה או העתקת תוכן</li>
          <li>לבצע פעולות העלולות לפגוע בתפקוד האתר</li>
          <li>להשתמש באתר לצרכים בלתי חוקיים</li>
          <li>לנסות לגשת למידע שאינו מיועד עבורו</li>
        </ul>
        <p className={pStyle}>החברה רשאית להגביל או לחסום גישה לאתר במקרה של שימוש בלתי תקין.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>3. תוכן האתר והבלוג</h2>
        <p className={pStyle}>האתר כולל מאמרים מקצועיים ותוכן בתחום הטכנולוגיה, תשלומים, מערכות SaaS ופתרונות דיגיטליים.</p>
        <p className={`${pStyle} font-semibold`}>החברה אינה מתחייבת כי:</p>
        <ul className={ulStyle}>
          <li>כל המידע באתר מעודכן בכל עת</li>
          <li>המידע מדויק או שלם</li>
          <li>המידע מתאים לשימוש מסוים של המשתמש</li>
        </ul>
        <p className={pStyle}>הסתמכות על מידע באתר נעשית באחריות המשתמש בלבד.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>4. הרשמה וגישה לדאשבורד</h2>
        <p className={pStyle}>חלק מהשירותים באתר מאפשרים גישה למערכת ניהול (Dashboard) עבור לקוחות החברה.</p>
        <p className={`${pStyle} font-semibold`}>בעת יצירת חשבון משתמש:</p>
        <ul className={ulStyle}>
          <li>על המשתמש לספק מידע נכון ומדויק</li>
          <li>המשתמש אחראי לשמירת סודיות פרטי הגישה שלו</li>
          <li>אין להעביר את הגישה לצד שלישי ללא אישור החברה</li>
        </ul>
        <p className={`${pStyle} font-semibold`}>החברה רשאית להשעות או לסגור חשבון במקרה של:</p>
        <ul className={ulStyle}>
          <li>הפרת תנאי שימוש</li>
          <li>שימוש בלתי מורשה במערכת</li>
          <li>פעילות העלולה לפגוע במערכות החברה</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>5. אבטחת מידע</h2>
        <p className={pStyle}>החברה נוקטת באמצעים סבירים להגנה על מערכותיה ועל מידע המשתמשים.</p>
        <p className={pStyle}>עם זאת, אין באפשרותה להבטיח כי מערכות האתר יהיו חסינות לחלוטין מפני:</p>
        <ul className={ulStyle}>
          <li>חדירות</li>
          <li>מתקפות סייבר</li>
          <li>תקלות טכנולוגיות</li>
        </ul>
        <p className={pStyle}>המשתמש מודע לכך שהשימוש באינטרנט כרוך בסיכונים מסוימים.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>6. קניין רוחני</h2>
        <p className={pStyle}>כל זכויות הקניין הרוחני באתר שייכות לחברה או לבעלי זכויות אחרים.</p>
        <p className={`${pStyle} font-semibold`}>זכויות אלו כוללות בין היתר:</p>
        <ul className={ulStyle}>
          <li>עיצוב האתר</li>
          <li>הקוד והתוכנה</li>
          <li>מאמרים ותוכן מקצועי</li>
          <li>סימנים מסחריים ולוגואים</li>
        </ul>
        <p className={pStyle}>אין להעתיק, לשכפל, להפיץ או לפרסם תוכן מהאתר ללא אישור מראש ובכתב מהחברה.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>7. קישורים לאתרים חיצוניים</h2>
        <p className={pStyle}>ייתכן שהאתר יכלול קישורים לאתרים חיצוניים.</p>
        <p className={pStyle}>החברה אינה אחראית לתוכן, לשירותים או למדיניות הפרטיות של אתרים אלו. השימוש באתרים חיצוניים נעשה באחריות המשתמש בלבד.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>8. הגבלת אחריות</h2>
        <p className={pStyle}>השימוש באתר נעשה על אחריות המשתמש בלבד.</p>
        <p className={pStyle}>החברה לא תישא באחריות לנזקים ישירים או עקיפים הנובעים מ:</p>
        <ul className={ulStyle}>
          <li>שימוש באתר</li>
          <li>הסתמכות על מידע המופיע באתר</li>
          <li>תקלות טכנולוגיות</li>
          <li>שיבושים בפעילות האתר</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>9. שינויים באתר</h2>
        <p className={pStyle}>החברה רשאית לעדכן את האתר, תוכנו ותנאי השימוש בכל עת.</p>
        <p className={pStyle}>המשך שימוש באתר לאחר שינוי התנאים מהווה הסכמה לתנאים המעודכנים.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>10. הדין החל</h2>
        <p className={pStyle}>על תנאי שימוש אלה יחולו דיני מדינת ישראל בלבד.</p>
        <p className={pStyle}>סמכות השיפוט הבלעדית בכל עניין הקשור לאתר תהיה לבתי המשפט המוסמכים בישראל.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>11. יצירת קשר</h2>
        <p className={pStyle}>לשאלות בנוגע לתנאי השימוש ניתן ליצור קשר עם החברה:</p>
        <p className={pStyle}>Email: <a href="mailto:support@nexus-payment.com" className={linkStyle}>support@nexus-payment.com</a></p>
      </div>
    </article>
  );
}

function EnglishContent() {
  return (
    <article className="max-w-none">
      <h1 className="text-3xl font-bold text-slate-900 mb-1">Terms of Use – Nexus</h1>
      <p className="text-sm text-slate-400 mb-10">Last updated: March 7, 2026</p>

      <div className={sectionStyle}>
        <p className={pStyle}>
          Welcome to the Nexus website at{' '}
          <a href="https://nexus-payment.com" className={linkStyle}>https://nexus-payment.com</a>{' '}
          (hereinafter: "the Website"). The website is operated by Nexus Consumer Ltd (hereinafter: "the Company", "Nexus").
        </p>
        <p className={pStyle}>
          These terms of use govern the use of the website, including its content, professional blog, and access to management systems (Dashboard) offered to the company's clients.
        </p>
        <p className={pStyle}>
          Entering the website, using it, or registering for systems offered through it constitutes full agreement by the user to these terms of use.
          If you do not agree to the terms set forth in this document – you should refrain from using the website.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>1. Purpose of the Website</h2>
        <p className={pStyle}>The website is designed to provide information about the company, its products and services, including:</p>
        <ul className={ulStyle}>
          <li>Marketing and technological information about the company's solutions</li>
          <li>Professional articles, guides and professional content on the blog</li>
          <li>Option to contact the company</li>
          <li>Access to the management system (Dashboard) for the company's clients</li>
          <li>Demonstrations, training materials and professional content</li>
        </ul>
        <p className={pStyle}>The information on the website is provided for informational purposes only and does not constitute a binding offer, professional advice, business recommendation or commitment by the company.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>2. Permitted Use of the Website</h2>
        <p className={pStyle}>The user agrees to use the website in a legal and fair manner only.</p>
        <p className={`${pStyle} font-semibold`}>Among other things, the user agrees not to:</p>
        <ul className={ulStyle}>
          <li>Attempt to penetrate the website's systems</li>
          <li>Run scripts, bots or automated systems for scanning or copying content</li>
          <li>Perform actions that may harm the website's operation</li>
          <li>Use the website for illegal purposes</li>
          <li>Attempt to access information not intended for them</li>
        </ul>
        <p className={pStyle}>The company may restrict or block access to the website in case of improper use.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>3. Website and Blog Content</h2>
        <p className={pStyle}>The website includes professional articles and content in the fields of technology, payments, SaaS systems and digital solutions.</p>
        <p className={`${pStyle} font-semibold`}>The company does not guarantee that:</p>
        <ul className={ulStyle}>
          <li>All information on the website is up to date at all times</li>
          <li>The information is accurate or complete</li>
          <li>The information is suitable for the user's specific use</li>
        </ul>
        <p className={pStyle}>Reliance on information on the website is at the user's sole responsibility.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>4. Registration and Dashboard Access</h2>
        <p className={pStyle}>Some services on the website allow access to a management system (Dashboard) for the company's clients.</p>
        <p className={`${pStyle} font-semibold`}>When creating a user account:</p>
        <ul className={ulStyle}>
          <li>The user must provide accurate and correct information</li>
          <li>The user is responsible for maintaining the confidentiality of their access credentials</li>
          <li>Access must not be transferred to a third party without company approval</li>
        </ul>
        <p className={`${pStyle} font-semibold`}>The company may suspend or close an account in case of:</p>
        <ul className={ulStyle}>
          <li>Violation of terms of use</li>
          <li>Unauthorized use of the system</li>
          <li>Activity that may harm the company's systems</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>5. Information Security</h2>
        <p className={pStyle}>The company takes reasonable measures to protect its systems and user information.</p>
        <p className={pStyle}>However, it cannot guarantee that the website's systems will be completely immune to:</p>
        <ul className={ulStyle}>
          <li>Intrusions</li>
          <li>Cyber attacks</li>
          <li>Technological malfunctions</li>
        </ul>
        <p className={pStyle}>The user acknowledges that internet use involves certain risks.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>6. Intellectual Property</h2>
        <p className={pStyle}>All intellectual property rights on the website belong to the company or other rights holders.</p>
        <p className={`${pStyle} font-semibold`}>These rights include, among others:</p>
        <ul className={ulStyle}>
          <li>Website design</li>
          <li>Code and software</li>
          <li>Articles and professional content</li>
          <li>Trademarks and logos</li>
        </ul>
        <p className={pStyle}>No content from the website may be copied, reproduced, distributed or published without prior written approval from the company.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>7. Links to External Websites</h2>
        <p className={pStyle}>The website may include links to external websites.</p>
        <p className={pStyle}>The company is not responsible for the content, services or privacy policies of these websites. Use of external websites is at the user's sole responsibility.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>8. Limitation of Liability</h2>
        <p className={pStyle}>Use of the website is at the user's sole responsibility.</p>
        <p className={pStyle}>The company shall not be liable for direct or indirect damages arising from:</p>
        <ul className={ulStyle}>
          <li>Use of the website</li>
          <li>Reliance on information appearing on the website</li>
          <li>Technological malfunctions</li>
          <li>Disruptions in website operation</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>9. Changes to the Website</h2>
        <p className={pStyle}>The company may update the website, its content and terms of use at any time.</p>
        <p className={pStyle}>Continued use of the website after changes to the terms constitutes agreement to the updated terms.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>10. Applicable Law</h2>
        <p className={pStyle}>These terms of use shall be governed exclusively by the laws of the State of Israel.</p>
        <p className={pStyle}>Exclusive jurisdiction in any matter related to the website shall be vested in the competent courts in Israel.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>11. Contact</h2>
        <p className={pStyle}>For questions regarding the terms of use, please contact the company:</p>
        <p className={pStyle}>Email: <a href="mailto:support@nexus-payment.com" className={linkStyle}>support@nexus-payment.com</a></p>
      </div>
    </article>
  );
}
