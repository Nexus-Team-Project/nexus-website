import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const sectionStyle = "mb-10";
const h2Style = "text-xl font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200";
const pStyle = "text-sm text-slate-700 leading-relaxed mb-3";
const ulStyle = "list-disc list-inside text-sm text-slate-700 leading-relaxed space-y-1 mb-3 ps-4";
const linkStyle = "text-indigo-600 hover:underline";

export default function AccessibilityPage() {
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
      <h1 className="text-3xl font-bold text-slate-900 mb-1">נגישות – Nexus</h1>
      <p className="text-sm text-slate-400 mb-10">עודכן לאחרונה: 7 במרץ 2026</p>

      <div className={sectionStyle}>
        <p className={pStyle}>
          חברת Nexus Consumer Ltd (להלן: "החברה") מחויבת להנגיש את אתר האינטרנט שלה{' '}
          <a href="https://nexus-payment.com" className={linkStyle}>https://nexus-payment.com</a>{' '}
          לכלל המשתמשים, לרבות אנשים עם מוגבלויות.
        </p>
        <p className={pStyle}>החברה פועלת על מנת לאפשר חוויית שימוש נוחה, שוויונית ונגישה ככל האפשר לכלל המשתמשים.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>1. תקן נגישות</h2>
        <p className={pStyle}>
          האתר שואף לעמוד בדרישות תקן הנגישות הבינלאומי WCAG 2.1 ברמה AA,
          וכן בדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (נגישות שירות) בישראל, ככל שהן חלות על האתר.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>2. התאמות נגישות באתר</h2>
        <p className={pStyle}>במסגרת מאמצי ההנגשה בוצעו באתר התאמות שונות, בין היתר:</p>
        <ul className={ulStyle}>
          <li>מבנה תוכן ברור עם שימוש בכותרות היררכיות</li>
          <li>אפשרות ניווט באמצעות מקלדת</li>
          <li>התאמה לשימוש עם קוראי מסך</li>
          <li>טקסטים קריאים וברורים</li>
          <li>התאמה למכשירים שונים ולמסכים בגדלים שונים</li>
          <li>שימוש בניגודיות צבעים מספקת ככל האפשר</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>3. שימוש ברכיבים וטכנולוגיות צד שלישי</h2>
        <p className={pStyle}>
          ייתכן כי חלק מהעמודים באתר כוללים רכיבים או שירותים של צדדים שלישיים.
          החברה פועלת ככל האפשר לוודא שגם רכיבים אלו יהיו נגישים.
          עם זאת, ייתכן כי במקרים מסוימים הנגישות תלויה בספקים חיצוניים.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>4. מגבלות נגישות אפשריות</h2>
        <p className={pStyle}>
          ייתכן כי חלקים מסוימים באתר עדיין אינם נגישים במלואם.
          החברה ממשיכה לפעול לשיפור הנגישות באתר באופן שוטף.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>5. פנייה בנושא נגישות</h2>
        <p className={pStyle}>
          אם נתקלתם בבעיה או בקושי בשימוש באתר,
          נשמח לקבל את פנייתכם על מנת שנוכל לבדוק את הנושא ולטפל בו.
        </p>
        <p className={`${pStyle} font-semibold`}>בעת פנייה בנושא נגישות מומלץ לציין:</p>
        <ul className={ulStyle}>
          <li>כתובת העמוד בו נתקלתם בבעיה</li>
          <li>תיאור הבעיה</li>
          <li>סוג הדפדפן והמכשיר בהם השתמשתם</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>6. פרטי יצירת קשר</h2>
        <p className={pStyle}>Email: <a href="mailto:support@nexus-payment.com" className={linkStyle}>support@nexus-payment.com</a></p>
      </div>
    </article>
  );
}

function EnglishContent() {
  return (
    <article className="max-w-none">
      <h1 className="text-3xl font-bold text-slate-900 mb-1">Accessibility – Nexus</h1>
      <p className="text-sm text-slate-400 mb-10">Last updated: March 7, 2026</p>

      <div className={sectionStyle}>
        <p className={pStyle}>
          Nexus Consumer Ltd (hereinafter: "the Company") is committed to making its website{' '}
          <a href="https://nexus-payment.com" className={linkStyle}>https://nexus-payment.com</a>{' '}
          accessible to all users, including people with disabilities.
        </p>
        <p className={pStyle}>The company works to provide a comfortable, equitable and accessible user experience for all users.</p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>1. Accessibility Standard</h2>
        <p className={pStyle}>
          The website strives to meet the requirements of the international accessibility standard WCAG 2.1 at level AA,
          as well as the requirements of equal rights regulations for people with disabilities (service accessibility) in Israel, where applicable.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>2. Accessibility Adaptations on the Website</h2>
        <p className={pStyle}>As part of accessibility efforts, various adaptations have been made to the website, including:</p>
        <ul className={ulStyle}>
          <li>Clear content structure using hierarchical headings</li>
          <li>Keyboard navigation capability</li>
          <li>Compatibility with screen readers</li>
          <li>Readable and clear text</li>
          <li>Adaptation for various devices and screen sizes</li>
          <li>Use of sufficient color contrast where possible</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>3. Use of Third-Party Components and Technologies</h2>
        <p className={pStyle}>
          Some pages on the website may include components or services from third parties.
          The company works to ensure that these components are also accessible.
          However, in some cases accessibility may depend on external providers.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>4. Possible Accessibility Limitations</h2>
        <p className={pStyle}>
          Certain parts of the website may not yet be fully accessible.
          The company continues to work on improving website accessibility on an ongoing basis.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>5. Accessibility Inquiries</h2>
        <p className={pStyle}>
          If you encounter a problem or difficulty using the website,
          we would be happy to receive your inquiry so we can investigate and address the issue.
        </p>
        <p className={`${pStyle} font-semibold`}>When contacting us about accessibility, it is recommended to specify:</p>
        <ul className={ulStyle}>
          <li>The URL of the page where you encountered the problem</li>
          <li>Description of the problem</li>
          <li>The browser and device you were using</li>
        </ul>
      </div>

      <div className={sectionStyle}>
        <h2 className={h2Style}>6. Contact Information</h2>
        <p className={pStyle}>Email: <a href="mailto:support@nexus-payment.com" className={linkStyle}>support@nexus-payment.com</a></p>
      </div>
    </article>
  );
}
