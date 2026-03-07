import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function TermsOfUsePage() {
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
      <h1 className="text-3xl font-bold text-slate-900 mb-2">תנאי שימוש באתר Nexus</h1>
      <p className="text-sm text-slate-500 mb-8">עודכן לאחרונה: 7 במרץ 2026</p>

      <p>
        ברוכים הבאים לאתר Nexus בכתובת{' '}
        <a href="https://nexus-payment.com" className="text-indigo-600 hover:underline">https://nexus-payment.com</a>{' '}
        (להלן: "האתר"). האתר מופעל על‑ידי Nexus Consumer Ltd (להלן: "החברה", "נקסוס").
      </p>

      <p>
        תנאי שימוש אלו מסדירים את השימוש באתר, לרבות בתכניו, בבלוג המקצועי, ובגישה למערכות ניהול (Dashboard) המוצעות ללקוחות החברה.
      </p>

      <p>
        הכניסה לאתר, השימוש בו או הרשמה למערכות המוצעות דרכו מהווים הסכמה מלאה מצד המשתמש לתנאי שימוש אלה.
        אם אינך מסכים לתנאים המפורטים במסמך זה – עליך להימנע משימוש באתר.
      </p>

      <h2>1. מטרת האתר</h2>
      <p>האתר נועד לספק מידע אודות החברה, מוצריה ושירותיה, לרבות:</p>
      <ul>
        <li>מידע שיווקי וטכנולוגי על פתרונות החברה</li>
        <li>מאמרים מקצועיים, מדריכים ותוכן מקצועי בבלוג</li>
        <li>אפשרות ליצירת קשר עם החברה</li>
        <li>גישה למערכת ניהול (Dashboard) עבור לקוחות החברה</li>
        <li>הדגמות, חומרי הדרכה ותכנים מקצועיים</li>
      </ul>
      <p>המידע באתר ניתן לצורכי מידע בלבד ואינו מהווה הצעה מחייבת, ייעוץ מקצועי, המלצה עסקית או התחייבות מצד החברה.</p>

      <h2>2. שימוש מותר באתר</h2>
      <p>המשתמש מתחייב להשתמש באתר באופן חוקי והוגן בלבד.</p>
      <p>בין היתר, המשתמש מתחייב שלא:</p>
      <ul>
        <li>לבצע ניסיון חדירה למערכות האתר</li>
        <li>להפעיל סקריפטים, בוטים או מערכות אוטומטיות לצורך סריקה או העתקת תוכן</li>
        <li>לבצע פעולות העלולות לפגוע בתפקוד האתר</li>
        <li>להשתמש באתר לצרכים בלתי חוקיים</li>
        <li>לנסות לגשת למידע שאינו מיועד עבורו</li>
      </ul>
      <p>החברה רשאית להגביל או לחסום גישה לאתר במקרה של שימוש בלתי תקין.</p>

      <h2>3. תוכן האתר והבלוג</h2>
      <p>האתר כולל מאמרים מקצועיים ותוכן בתחום הטכנולוגיה, תשלומים, מערכות SaaS ופתרונות דיגיטליים.</p>
      <p>החברה אינה מתחייבת כי:</p>
      <ul>
        <li>כל המידע באתר מעודכן בכל עת</li>
        <li>המידע מדויק או שלם</li>
        <li>המידע מתאים לשימוש מסוים של המשתמש</li>
      </ul>
      <p>הסתמכות על מידע באתר נעשית באחריות המשתמש בלבד.</p>

      <h2>4. הרשמה וגישה לדאשבורד</h2>
      <p>חלק מהשירותים באתר מאפשרים גישה למערכת ניהול (Dashboard) עבור לקוחות החברה.</p>
      <p>בעת יצירת חשבון משתמש:</p>
      <ul>
        <li>על המשתמש לספק מידע נכון ומדויק</li>
        <li>המשתמש אחראי לשמירת סודיות פרטי הגישה שלו</li>
        <li>אין להעביר את הגישה לצד שלישי ללא אישור החברה</li>
      </ul>
      <p>החברה רשאית להשעות או לסגור חשבון במקרה של:</p>
      <ul>
        <li>הפרת תנאי שימוש</li>
        <li>שימוש בלתי מורשה במערכת</li>
        <li>פעילות העלולה לפגוע במערכות החברה</li>
      </ul>

      <h2>5. אבטחת מידע</h2>
      <p>החברה נוקטת באמצעים סבירים להגנה על מערכותיה ועל מידע המשתמשים.</p>
      <p>עם זאת, אין באפשרותה להבטיח כי מערכות האתר יהיו חסינות לחלוטין מפני:</p>
      <ul>
        <li>חדירות</li>
        <li>מתקפות סייבר</li>
        <li>תקלות טכנולוגיות</li>
      </ul>
      <p>המשתמש מודע לכך שהשימוש באינטרנט כרוך בסיכונים מסוימים.</p>

      <h2>6. קניין רוחני</h2>
      <p>כל זכויות הקניין הרוחני באתר שייכות לחברה או לבעלי זכויות אחרים.</p>
      <p>זכויות אלו כוללות בין היתר:</p>
      <ul>
        <li>עיצוב האתר</li>
        <li>הקוד והתוכנה</li>
        <li>מאמרים ותוכן מקצועי</li>
        <li>סימנים מסחריים ולוגואים</li>
      </ul>
      <p>אין להעתיק, לשכפל, להפיץ או לפרסם תוכן מהאתר ללא אישור מראש ובכתב מהחברה.</p>

      <h2>7. קישורים לאתרים חיצוניים</h2>
      <p>ייתכן שהאתר יכלול קישורים לאתרים חיצוניים.</p>
      <p>החברה אינה אחראית לתוכן, לשירותים או למדיניות הפרטיות של אתרים אלו. השימוש באתרים חיצוניים נעשה באחריות המשתמש בלבד.</p>

      <h2>8. הגבלת אחריות</h2>
      <p>השימוש באתר נעשה על אחריות המשתמש בלבד.</p>
      <p>החברה לא תישא באחריות לנזקים ישירים או עקיפים הנובעים מ:</p>
      <ul>
        <li>שימוש באתר</li>
        <li>הסתמכות על מידע המופיע באתר</li>
        <li>תקלות טכנולוגיות</li>
        <li>שיבושים בפעילות האתר</li>
      </ul>

      <h2>9. שינויים באתר</h2>
      <p>החברה רשאית לעדכן את האתר, תוכנו ותנאי השימוש בכל עת.</p>
      <p>המשך שימוש באתר לאחר שינוי התנאים מהווה הסכמה לתנאים המעודכנים.</p>

      <h2>10. הדין החל</h2>
      <p>על תנאי שימוש אלה יחולו דיני מדינת ישראל בלבד.</p>
      <p>סמכות השיפוט הבלעדית בכל עניין הקשור לאתר תהיה לבתי המשפט המוסמכים בישראל.</p>

      <h2>11. יצירת קשר</h2>
      <p>לשאלות בנוגע לתנאי השימוש ניתן ליצור קשר עם החברה:</p>
      <p>Email: <a href="mailto:support@nexus-payment.com" className="text-indigo-600 hover:underline">support@nexus-payment.com</a></p>
    </article>
  );
}

function EnglishContent() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Use – Nexus</h1>
      <p className="text-sm text-slate-500 mb-8">Last updated: March 7, 2026</p>

      <p>
        Welcome to the Nexus website at{' '}
        <a href="https://nexus-payment.com" className="text-indigo-600 hover:underline">https://nexus-payment.com</a>{' '}
        (hereinafter: "the Website"). The website is operated by Nexus Consumer Ltd (hereinafter: "the Company", "Nexus").
      </p>

      <p>
        These terms of use govern the use of the website, including its content, professional blog, and access to management systems (Dashboard) offered to the company's clients.
      </p>

      <p>
        Entering the website, using it, or registering for systems offered through it constitutes full agreement by the user to these terms of use.
        If you do not agree to the terms set forth in this document – you should refrain from using the website.
      </p>

      <h2>1. Purpose of the Website</h2>
      <p>The website is designed to provide information about the company, its products and services, including:</p>
      <ul>
        <li>Marketing and technological information about the company's solutions</li>
        <li>Professional articles, guides and professional content on the blog</li>
        <li>Option to contact the company</li>
        <li>Access to the management system (Dashboard) for the company's clients</li>
        <li>Demonstrations, training materials and professional content</li>
      </ul>
      <p>The information on the website is provided for informational purposes only and does not constitute a binding offer, professional advice, business recommendation or commitment by the company.</p>

      <h2>2. Permitted Use of the Website</h2>
      <p>The user agrees to use the website in a legal and fair manner only.</p>
      <p>Among other things, the user agrees not to:</p>
      <ul>
        <li>Attempt to penetrate the website's systems</li>
        <li>Run scripts, bots or automated systems for scanning or copying content</li>
        <li>Perform actions that may harm the website's operation</li>
        <li>Use the website for illegal purposes</li>
        <li>Attempt to access information not intended for them</li>
      </ul>
      <p>The company may restrict or block access to the website in case of improper use.</p>

      <h2>3. Website and Blog Content</h2>
      <p>The website includes professional articles and content in the fields of technology, payments, SaaS systems and digital solutions.</p>
      <p>The company does not guarantee that:</p>
      <ul>
        <li>All information on the website is up to date at all times</li>
        <li>The information is accurate or complete</li>
        <li>The information is suitable for the user's specific use</li>
      </ul>
      <p>Reliance on information on the website is at the user's sole responsibility.</p>

      <h2>4. Registration and Dashboard Access</h2>
      <p>Some services on the website allow access to a management system (Dashboard) for the company's clients.</p>
      <p>When creating a user account:</p>
      <ul>
        <li>The user must provide accurate and correct information</li>
        <li>The user is responsible for maintaining the confidentiality of their access credentials</li>
        <li>Access must not be transferred to a third party without company approval</li>
      </ul>
      <p>The company may suspend or close an account in case of:</p>
      <ul>
        <li>Violation of terms of use</li>
        <li>Unauthorized use of the system</li>
        <li>Activity that may harm the company's systems</li>
      </ul>

      <h2>5. Information Security</h2>
      <p>The company takes reasonable measures to protect its systems and user information.</p>
      <p>However, it cannot guarantee that the website's systems will be completely immune to:</p>
      <ul>
        <li>Intrusions</li>
        <li>Cyber attacks</li>
        <li>Technological malfunctions</li>
      </ul>
      <p>The user acknowledges that internet use involves certain risks.</p>

      <h2>6. Intellectual Property</h2>
      <p>All intellectual property rights on the website belong to the company or other rights holders.</p>
      <p>These rights include, among others:</p>
      <ul>
        <li>Website design</li>
        <li>Code and software</li>
        <li>Articles and professional content</li>
        <li>Trademarks and logos</li>
      </ul>
      <p>No content from the website may be copied, reproduced, distributed or published without prior written approval from the company.</p>

      <h2>7. Links to External Websites</h2>
      <p>The website may include links to external websites.</p>
      <p>The company is not responsible for the content, services or privacy policies of these websites. Use of external websites is at the user's sole responsibility.</p>

      <h2>8. Limitation of Liability</h2>
      <p>Use of the website is at the user's sole responsibility.</p>
      <p>The company shall not be liable for direct or indirect damages arising from:</p>
      <ul>
        <li>Use of the website</li>
        <li>Reliance on information appearing on the website</li>
        <li>Technological malfunctions</li>
        <li>Disruptions in website operation</li>
      </ul>

      <h2>9. Changes to the Website</h2>
      <p>The company may update the website, its content and terms of use at any time.</p>
      <p>Continued use of the website after changes to the terms constitutes agreement to the updated terms.</p>

      <h2>10. Applicable Law</h2>
      <p>These terms of use shall be governed exclusively by the laws of the State of Israel.</p>
      <p>Exclusive jurisdiction in any matter related to the website shall be vested in the competent courts in Israel.</p>

      <h2>11. Contact</h2>
      <p>For questions regarding the terms of use, please contact the company:</p>
      <p>Email: <a href="mailto:support@nexus-payment.com" className="text-indigo-600 hover:underline">support@nexus-payment.com</a></p>
    </article>
  );
}
