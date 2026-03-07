import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function AccessibilityPage() {
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
      <h1 className="text-3xl font-bold text-slate-900 mb-2">נגישות – Nexus</h1>
      <p className="text-sm text-slate-500 mb-8">עודכן לאחרונה: 7 במרץ 2026</p>

      <p>
        חברת Nexus Consumer Ltd (להלן: "החברה") מחויבת להנגיש את אתר האינטרנט שלה{' '}
        <a href="https://nexus-payment.com" className="text-indigo-600 hover:underline">https://nexus-payment.com</a>{' '}
        לכלל המשתמשים, לרבות אנשים עם מוגבלויות.
      </p>

      <p>החברה פועלת על מנת לאפשר חוויית שימוש נוחה, שוויונית ונגישה ככל האפשר לכלל המשתמשים.</p>

      <h2>תקן נגישות</h2>
      <p>
        האתר שואף לעמוד בדרישות תקן הנגישות הבינלאומי WCAG 2.1 ברמה AA,
        וכן בדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (נגישות שירות) בישראל, ככל שהן חלות על האתר.
      </p>

      <h2>התאמות נגישות באתר</h2>
      <p>במסגרת מאמצי ההנגשה בוצעו באתר התאמות שונות, בין היתר:</p>
      <ul>
        <li>מבנה תוכן ברור עם שימוש בכותרות היררכיות</li>
        <li>אפשרות ניווט באמצעות מקלדת</li>
        <li>התאמה לשימוש עם קוראי מסך</li>
        <li>טקסטים קריאים וברורים</li>
        <li>התאמה למכשירים שונים ולמסכים בגדלים שונים</li>
        <li>שימוש בניגודיות צבעים מספקת ככל האפשר</li>
      </ul>

      <h2>שימוש ברכיבים וטכנולוגיות צד שלישי</h2>
      <p>
        ייתכן כי חלק מהעמודים באתר כוללים רכיבים או שירותים של צדדים שלישיים.
        החברה פועלת ככל האפשר לוודא שגם רכיבים אלו יהיו נגישים.
        עם זאת, ייתכן כי במקרים מסוימים הנגישות תלויה בספקים חיצוניים.
      </p>

      <h2>מגבלות נגישות אפשריות</h2>
      <p>
        ייתכן כי חלקים מסוימים באתר עדיין אינם נגישים במלואם.
        החברה ממשיכה לפעול לשיפור הנגישות באתר באופן שוטף.
      </p>

      <h2>פנייה בנושא נגישות</h2>
      <p>
        אם נתקלתם בבעיה או בקושי בשימוש באתר,
        נשמח לקבל את פנייתכם על מנת שנוכל לבדוק את הנושא ולטפל בו.
      </p>
      <p>בעת פנייה בנושא נגישות מומלץ לציין:</p>
      <ul>
        <li>כתובת העמוד בו נתקלתם בבעיה</li>
        <li>תיאור הבעיה</li>
        <li>סוג הדפדפן והמכשיר בהם השתמשתם</li>
      </ul>

      <h2>פרטי יצירת קשר</h2>
      <p>Email: <a href="mailto:support@nexus-payment.com" className="text-indigo-600 hover:underline">support@nexus-payment.com</a></p>
    </article>
  );
}

function EnglishContent() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Accessibility – Nexus</h1>
      <p className="text-sm text-slate-500 mb-8">Last updated: March 7, 2026</p>

      <p>
        Nexus Consumer Ltd (hereinafter: "the Company") is committed to making its website{' '}
        <a href="https://nexus-payment.com" className="text-indigo-600 hover:underline">https://nexus-payment.com</a>{' '}
        accessible to all users, including people with disabilities.
      </p>

      <p>The company works to provide a comfortable, equitable and accessible user experience for all users.</p>

      <h2>Accessibility Standard</h2>
      <p>
        The website strives to meet the requirements of the international accessibility standard WCAG 2.1 at level AA,
        as well as the requirements of equal rights regulations for people with disabilities (service accessibility) in Israel, where applicable.
      </p>

      <h2>Accessibility Adaptations on the Website</h2>
      <p>As part of accessibility efforts, various adaptations have been made to the website, including:</p>
      <ul>
        <li>Clear content structure using hierarchical headings</li>
        <li>Keyboard navigation capability</li>
        <li>Compatibility with screen readers</li>
        <li>Readable and clear text</li>
        <li>Adaptation for various devices and screen sizes</li>
        <li>Use of sufficient color contrast where possible</li>
      </ul>

      <h2>Use of Third-Party Components and Technologies</h2>
      <p>
        Some pages on the website may include components or services from third parties.
        The company works to ensure that these components are also accessible.
        However, in some cases accessibility may depend on external providers.
      </p>

      <h2>Possible Accessibility Limitations</h2>
      <p>
        Certain parts of the website may not yet be fully accessible.
        The company continues to work on improving website accessibility on an ongoing basis.
      </p>

      <h2>Accessibility Inquiries</h2>
      <p>
        If you encounter a problem or difficulty using the website,
        we would be happy to receive your inquiry so we can investigate and address the issue.
      </p>
      <p>When contacting us about accessibility, it is recommended to specify:</p>
      <ul>
        <li>The URL of the page where you encountered the problem</li>
        <li>Description of the problem</li>
        <li>The browser and device you were using</li>
      </ul>

      <h2>Contact Information</h2>
      <p>Email: <a href="mailto:support@nexus-payment.com" className="text-indigo-600 hover:underline">support@nexus-payment.com</a></p>
    </article>
  );
}
