import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Enable pgvector extension (optional — may not be available on all hosts) ──
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector extension enabled');

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'KnowledgeChunk' AND column_name = 'embedding'
        ) THEN
          ALTER TABLE "KnowledgeChunk" ADD COLUMN embedding vector(1536);
        END IF;
      END $$;
    `);
    console.log('✅ embedding column ensured on KnowledgeChunk');
  } catch {
    console.log('⚠️  pgvector not available — skipping vector extension setup');
  }

  // ─── Default AI system prompt ─────────────────────────────
  await prisma.aiConfig.upsert({
    where: { key: 'system_prompt' },
    create: {
      key: 'system_prompt',
      value: `אתה נציג תמיכה ומכירות של Nexus — אקו־סיסטם של פתרונות נאמנות ותשלומים.
עונה תמיד בעברית, בנימה מקצועית אך ידידותית וחמה.

הנחיות:
• הבן את צורך הלקוח ב-1-2 שאלות לפני שאתה ממליץ
• תשובות קצרות ולעניין — עד 3 משפטים
• אם הלקוח מעוניין בדמו או שאלה טכנית מורכבת — הצע נציג אנושי
• אל תמציא מחירים — השתמש רק בפרטים מהידע שסופק לך
• אם אין לך תשובה מדויקת — אמור בכנות ותציע נציג
• אם הלקוח מבקש נציג אנושי — ענה: ESCALATE
• שאל שאלות הכשרה: מה היית רוצה לשפר? איזה סוג ארגון? מה התפקיד שלך? כמה אנשים בקהילה?

משפט escalation: "אני מחבר אותך עכשיו לנציג מומחה שיוכל לעזור — הוא יחזור אליך תוך דקות."`,
      description: 'הנחיות מערכת ל-AI assistant בצ\'אט',
    },
    update: {},
  });

  // ─── Escalation threshold ─────────────────────────────────
  await prisma.aiConfig.upsert({
    where: { key: 'escalation_threshold' },
    create: {
      key: 'escalation_threshold',
      value: '0.35',
      description: 'Minimum cosine similarity for a relevant chunk (0–1). Below this → escalate.',
    },
    update: {},
  });

  // ─── Max AI messages before escalation ───────────────────
  await prisma.aiConfig.upsert({
    where: { key: 'max_ai_messages' },
    create: {
      key: 'max_ai_messages',
      value: '5',
      description: 'Maximum number of AI messages in a session before forcing escalation to human',
    },
    update: {},
  });

  // ─── Seed few-shot examples (21 real Nexus examples) ──────
  const examples: Array<{ question: string; answer: string; category: string }> = [
    {
      question: 'כמה עולה להקים מועדון הטבות',
      answer: 'המחיר תלוי בגודל הארגון וברמת האינטגרציה. בדרך כלל מתחילים ממודל מנוי חודשי, וניתן להקים מערכת בסיסית תוך זמן קצר. אם תרצה, אוכל לשאול כמה שאלות קצרות כדי להבין מה מתאים לך.',
      category: 'pricing',
    },
    {
      question: 'כמה זמן לוקח להקים מערכת עם Nexus',
      answer: 'זה תלוי בסוג הפתרון. מתנות לעובדים או מועדון הטבות יכולים לפעול כמעט מיד לאחר ההרשמה למערכת. פתרונות סליקה לעסקים מוקמים בדרך כלל בתוך כשבועיים, ופתרונות מתקדמים כמו הנפקת כרטיסים או ארנקים דיגיטליים מוקמים לרוב בתוך מספר חודשים.',
      category: 'implementation',
    },
    {
      question: 'איך Nexus מתמחרת את השירות',
      answer: 'המודל של Nexus משתנה לפי סוג הפתרון. בדרך כלל יש מנוי לארגון, ובנוסף יכולים להיות רכיבים כמו עמלות על עסקאות, עמלות סליקה או שיתופי פעולה עם עסקים. המבנה המדויק תלוי במוצר ובשימוש של הארגון במערכת.',
      category: 'pricing',
    },
    {
      question: 'כמה עולה Nexus',
      answer: 'העלות תלויה בסוג הפתרון שהארגון צריך ובאופן שבו משתמשים בפלטפורמה. בדרך כלל המודל כולל מנוי לארגון ובמקרים מסוימים גם עמלות על עסקאות או שירותים פיננסיים. אם תרצה, אוכל להבין מה הצורך שלך ולהסביר מה האפשרויות הרלוונטיות.',
      category: 'pricing',
    },
    {
      question: 'האם צריך אפליקציה כדי להשתמש ב-Nexus',
      answer: 'לא בהכרח. כל המוצרים של Nexus מנוהלים מתוך Dashboard מרכזי אחד, וניתן להתחיל לעבוד מיד לאחר ההתחברות. במידת הצורך ניתן גם לחבר את המערכת לאפליקציות, אתרים או מערכות אחרות של הארגון באמצעות אינטגרציות.',
      category: 'product',
    },
    {
      question: 'איך Nexus עוזרת לארגון להרוויח כסף',
      answer: 'Nexus מאפשרת לארגונים לייצר פעילות כלכלית סביב הקהילה שלהם. ניתן להפעיל מועדון הטבות, לנהל תשלומים וליצור מנועי הכנסה כמו דמי חבר, שיתופי פעולה עם עסקים או מודלים נוספים בהתאם לפעילות הארגון. בנוסף, המערכת מחזקת את הקשר עם הקהילה ומסייעת לשימור משתמשים לאורך זמן.',
      category: 'value',
    },
    {
      question: 'מה זה Nexus',
      answer: 'Nexus היא פלטפורמת נאמנות ותשלומים שמאפשרת לארגונים לחזק את הקשר עם הקהילה שלהם — לקוחות, עובדים, משתמשים, בוגרים או תורמים — וליצור פעילות כלכלית סביב הקהילה באמצעות פתרונות נאמנות, הטבות ותשלומים.',
      category: 'product',
    },
    {
      question: 'האם Nexus היא רק מועדון הטבות',
      answer: 'לא. Nexus היא אקו־סיסטם של פתרונות נאמנות ותשלומים. מועדון הטבות הוא רק אחד מהמוצרים בפלטפורמה. המערכת כוללת גם פתרונות סליקה ותשלומים, הנפקת כרטיסים וארנקים דיגיטליים, תוכניות נאמנות, מתנות לעובדים, שוברים ושירותים פיננסיים נוספים.',
      category: 'product',
    },
    {
      question: 'אילו מוצרים יש ב-Nexus',
      answer: 'Nexus מציעה אקו־סיסטם של פתרונות נאמנות ותשלומים. בין המוצרים: מועדוני הטבות, תוכניות נאמנות, מתנות ותקציבי רווחה לעובדים, שוברים דיגיטליים, פתרונות סליקה ותשלומים, הנפקת כרטיסים וארנקים דיגיטליים, וכן שירותים פיננסיים נוספים כמו חשבוניות ופקטורינג.',
      category: 'product',
    },
    {
      question: 'למה להשתמש ב-Nexus ולא לבנות פתרון בעצמנו',
      answer: 'בניית מערכת שמשלבת נאמנות ותשלומים דורשת תשתית פיננסית מורכבת, אינטגרציות עם ספקי תשלום וניהול שותפויות עם עסקים וספקים. Nexus מרכזת את כל היכולות האלו בפלטפורמה אחת, כך שהארגון יכול להפעיל פתרונות מתקדמים בלי להקים ולנהל את כל התשתית בעצמו.',
      category: 'value',
    },
    {
      question: 'למי Nexus מתאימה',
      answer: 'Nexus מתאימה לארגונים שיש להם קהילה של אנשים פרטיים — למשל עובדים, לקוחות, משתמשים, בוגרים, תלמידים או תורמים. כאשר ארגון רוצה לחזק את הקשר עם הקהילה שלו וליצור פעילות כלכלית סביב הקהילה, הפלטפורמה של Nexus יכולה לספק את התשתית לכך.',
      category: 'product',
    },
    {
      question: 'איך Nexus מתחברת למערכות קיימות',
      answer: 'Nexus מספקת כלים למפתחים כמו APIs, Webhooks, SDKs ו-Embedded widgets שמאפשרים לשלב את השירותים בתוך אתרים, אפליקציות ומערכות קיימות. ניתן גם להשתמש בפתרונות White-label. ההקמה יכולה להתבצע עצמאית בעזרת התיעוד שלנו או בעזרת שותפי ההטמעה של Nexus.',
      category: 'integration',
    },
    {
      question: 'מי משתמש ב-Nexus היום',
      answer: 'הפלטפורמה של Nexus משמשת מגוון רחב של ארגונים ועסקים, כולל רשתות קמעונאיות, ארגונים ממשלתיים, עמותות, ארגוני בוגרים, חברות ביטוח ועסקים קטנים ובינוניים. המשותף לכולם הוא שיש להם קהילה של משתמשים, עובדים או לקוחות שהם רוצים לחזק את הקשר איתה ולהפעיל סביבה פעילות כלכלית.',
      category: 'social_proof',
    },
    {
      question: 'האם Nexus מתאימה גם לארגונים קטנים',
      answer: 'כן. Nexus בנויה כפלטפורמה סקיילבילית שיכולה להתאים גם לארגונים קטנים וגם לארגונים גדולים מאוד. ניתן להפעיל את הפתרונות בהתאם לגודל הקהילה ולצרכים של הארגון.',
      category: 'product',
    },
    {
      question: 'איך משתמשים רואים את Nexus',
      answer: 'זה תלוי באופן שבו הארגון בוחר להפעיל את המערכת. ניתן להשתמש ב-Nexus כתשתית ולבנות חוויית משתמש מותאמת דרך APIs וכלי פיתוח, או להשתמש בממשקים המובנים של הפלטפורמה. ברוב המקרים הארגון מטמיע את השירות תחת המותג שלו כך שהמשתמשים חווים אותו כחלק מהמערכת של הארגון.',
      category: 'product',
    },
    {
      question: 'איך מתחילים לעבוד עם Nexus',
      answer: 'אפשר להתחיל בצורה עצמאית דרך ה-Dashboard של Nexus ולהפעיל חלק מהפתרונות מיד. במקרים פשוטים כמו מתנות לעובדים או סליקה בסיסית ניתן להתחיל לעבוד במהירות. אם מדובר בארגון גדול יותר או בפרויקט מורכב יותר, אפשר גם לקבוע שיחה עם הצוות כדי לבנות את הפתרון המתאים.',
      category: 'onboarding',
    },
    {
      question: 'איזו בעיה Nexus פותרת',
      answer: 'ארגונים רבים רוצים לחזק את הקשר עם הקהילה שלהם ולנהל פעילות כלכלית סביב הקהילה, אבל בנייה של תשתיות נאמנות ותשלומים היא מורכבת ודורשת ידע פיננסי וטכנולוגי. Nexus מספקת את התשתית הזו במערכת אחת, כך שהארגון יכול להפעיל פתרונות נאמנות ותשלומים בקלות מתוך Dashboard מרכזי.',
      category: 'value',
    },
    {
      question: 'אפשר לראות דמו',
      answer: 'כן. ניתן לקבוע פגישת דמו קצרה עם צוות Nexus כדי לראות איך הפלטפורמה עובדת ולהבין אילו פתרונות מתאימים לארגון שלך.',
      category: 'sales',
    },
    {
      question: 'איך Nexus יכולה לעזור לארגון שלי',
      answer: 'Nexus עוזרת לארגונים לחזק את הקשר עם הקהילה שלהם – עובדים, לקוחות או משתמשים – ולהפעיל סביב הקהילה פעילות כלכלית באמצעות פתרונות נאמנות ותשלומים.',
      category: 'sales',
    },
    {
      question: 'פתיחת שיחה',
      answer: 'כדי להבין איך Nexus יכולה לעזור – מה היית רוצה לשפר בקשר עם הקהילה, הלקוחות או העובדים שלך?',
      category: 'qualification',
    },
    {
      question: 'מה התפקיד שלך בארגון',
      answer: 'כדי לכוון אותך לפתרון המתאים – מה התפקיד שלך בארגון?',
      category: 'qualification',
    },
  ];

  // Delete old placeholder examples before re-seeding
  await prisma.aiExample.deleteMany({
    where: { id: { startsWith: 'seed_' } },
  });

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const seedId = `seed_${ex.category}_${i}`;
    await prisma.aiExample.upsert({
      where: { id: seedId },
      create: { id: seedId, ...ex, language: 'he' },
      update: { question: ex.question, answer: ex.answer, category: ex.category },
    });
  }
  console.log(`✅ ${examples.length} AI few-shot examples seeded`);

  // ─── Seed knowledge chunks (23 Nexus KB entries) ──────────
  // Embeddings are NOT generated here (requires OpenAI API key).
  // Run: POST /api/admin/ai/knowledge to re-insert with embeddings,
  // or use the embed-knowledge script after seeding.
  const knowledgeChunks: Array<{ title: string; content: string; source: string }> = [
    {
      title: 'מה זה Nexus',
      content: 'Nexus היא פלטפורמת נאמנות ותשלומים שמאפשרת לארגונים לחזק את הקשר עם הקהילה שלהם — לקוחות, עובדים, משתמשים, בוגרים או תורמים — וליצור פעילות כלכלית סביב הקהילה באמצעות פתרונות נאמנות, הטבות ותשלומים.',
      source: 'kb_seed',
    },
    {
      title: 'מי משתמש ב-Nexus',
      content: 'Nexus עובדת עם מגוון רחב של ארגונים ועסקים. בין המשתמשים בפלטפורמה ניתן למצוא רשתות קמעונאיות, ארגונים ממשלתיים, עמותות, ארגוני בוגרים, חברות ביטוח, עסקים קטנים ובינוניים וארגונים נוספים שמנהלים קהילה של משתמשים, עובדים או לקוחות. הפלטפורמה מתאימה לכל ארגון שמעוניין לחזק את הקשר עם הקהילה שלו ולהפעיל פתרונות נאמנות ותשלומים.',
      source: 'kb_seed',
    },
    {
      title: 'פלטפורמת הטבות ומועדון צרכנות',
      content: 'Nexus מאפשרת לארגונים להפעיל מועדון הטבות דיגיטלי עבור חברי הקהילה שלהם. חברי המועדון יכולים לגשת להטבות בתחומים שונים כמו צרכנות, אלקטרוניקה, פיננסים, נופש, אופנה ושירותים. ההטבות יכולות להיות מבוססות שוברים דיגיטליים, קופונים, או השארת פרטים לספקים. הפלטפורמה מאפשרת לארגון להעניק ערך כלכלי אמיתי לחברי הקהילה שלו לאורך כל השנה.',
      source: 'kb_seed',
    },
    {
      title: 'ניהול שוברים וכרטיסי מתנה דיגיטליים',
      content: 'המערכת של Nexus מאפשרת ליצור, לנהל ולמכור שוברים דיגיטליים וכרטיסי מתנה. משתמשים יכולים לרכוש שובר דרך הפלטפורמה, לקבל קוד דיגיטלי ולממש אותו אצל הספק. ניתן להגדיר ערך שובר, הנחה, תנאי שימוש ותוקף. המערכת מאפשרת גם הפצה רחבה של שוברים דרך מועדוני לקוחות, קהילות או שותפים.',
      source: 'kb_seed',
    },
    {
      title: 'תוכניות נאמנות וצבירת נקודות',
      content: 'Nexus מאפשרת להפעיל תוכניות נאמנות מתקדמות כמו צבירת נקודות, החזר כספי או הטבות מותאמות. ארגונים יכולים להגדיר חוקים לצבירה ומימוש של נקודות, ליצור תגמולים לחברי הקהילה ולחזק את נאמנות הלקוחות לאורך זמן. המערכת מאפשרת התאמה מלאה של הלוגיקה העסקית בהתאם לצרכי הארגון.',
      source: 'kb_seed',
    },
    {
      title: 'אינטגרציות עם מערכות תשלום',
      content: 'Nexus מתחברת לספקי תשלום ולמערכות סליקה שונות כדי לאפשר ביצוע רכישות ומימוש הטבות בצורה חלקה. ניתן לשלב את הפלטפורמה עם אתרי אינטרנט, מערכות ארגוניות או אפליקציות קיימות, כך שהמשתמשים יוכלו לבצע רכישות או לממש הטבות בצורה פשוטה.',
      source: 'kb_seed',
    },
    {
      title: 'התאמה אישית ומיתוג',
      content: 'הפלטפורמה של Nexus מאפשרת התאמה מלאה למותג של הארגון. ניתן להפעיל מועדון הטבות ממותג, להציג לוגו וצבעים של הארגון, ולהטמיע את המערכת בתוך האתר או האפליקציה של הארגון. כך המשתמשים חווים שירות שמרגיש כחלק טבעי מהמותג.',
      source: 'kb_seed',
    },
    {
      title: 'תהליך הצטרפות לארגון',
      content: 'משתמשים מצטרפים למועדון ההטבות דרך הרשמה באתר או דרך הארגון אליו הם משתייכים. לאחר ההרשמה הם יכולים להיכנס לפלטפורמה, לצפות בהטבות הזמינות עבורם ולבצע רכישות או מימושים בהתאם להרשאות שהארגון הגדיר.',
      source: 'kb_seed',
    },
    {
      title: 'שירות: מועדון הטבות לארגונים',
      content: 'Nexus מאפשרת לארגונים להפעיל מועדון הטבות דיגיטלי לחברי הקהילה שלהם. השירות כולל מערכת לניהול משתמשים, סל הטבות מתרחב בתחומי צרכנות שונים ויכולת לפרסם הטבות לחברי הקהילה. זמן ההקמה תלוי באינטגרציה עם מערכות הארגון, אך בדרך כלל ניתן להפעיל את המועדון בתוך כשבוע.',
      source: 'kb_seed',
    },
    {
      title: 'היתרונות של Nexus',
      content: 'Nexus היא פלטפורמה המשלבת פתרונות נאמנות ותשלומים במערכת אחת. הארגון יכול להפעיל מועדון הטבות, תוכניות נאמנות ופתרונות תשלום בצורה משולבת. הפלטפורמה מאפשרת לארגונים להפוך קהילה קיימת – עובדים, לקוחות, בוגרים או תורמים – למנוע כלכלי באמצעות הטבות, שוברים ופעילות צרכנית. בנוסף, Nexus מחברת בין עסקים לבין קהילות משתמשים ומאפשרת לעסקים להציע הטבות בתוך המועדונים, כך שנוצר ערך גם לארגון, גם לעסקים וגם למשתמשים.',
      source: 'kb_seed',
    },
    {
      title: 'זמן הקמה של פתרונות Nexus',
      content: 'זמן ההקמה של פתרונות Nexus תלוי בסוג המוצר. פתרונות כמו מתנות לעובדים או הפעלת מועדון הטבות וארנק דיגיטלי יכולים לפעול כמעט מיד לאחר פתיחת חשבון והתחברות ל-Dashboard. פתרונות סליקה לעסקים דורשים בדרך כלל תהליך קצר של חיבור ואישור ונמשכים לרוב עד כשבועיים. פתרונות מתקדמים יותר כמו הנפקת כרטיסים וארנקים דיגיטליים ממותגים הם פרויקטים פיננסיים מורכבים יותר, ובדרך כלל מוקמים בתוך מספר חודשים, לרוב עד כארבעה חודשים.',
      source: 'kb_seed',
    },
    {
      title: 'מודל ההכנסות של Nexus',
      content: 'המודל העסקי של Nexus מבוסס על שילוב של מספר מקורות הכנסה, בהתאם לפתרון שבו הארגון משתמש. בדרך כלל המערכת פועלת במודל מנוי חודשי לארגון (subscription), ובנוסף יכולים להיות רכיבים נוספים כמו עמלות על עסקאות, עמלות סליקה, עמלות על שיתופי פעולה עם עסקים והטבות, וכן עמלות פיננסיות במוצרים מתקדמים יותר כמו פתרונות תשלום או כרטיסים. המבנה המדויק תלוי במוצר ובאופן שבו הארגון משתמש בפלטפורמה.',
      source: 'kb_seed',
    },
    {
      title: 'איך עובדים עם מערכת Nexus',
      content: 'כל הפתרונות של Nexus מנוהלים מתוך Dashboard מרכזי אחד. לאחר ההרשמה למערכת ניתן להפעיל את המוצרים השונים ולהתחיל לעבוד במהירות. חלק מהפתרונות פועלים ישירות מתוך המערכת, וחלקם יכולים להתחבר לאפליקציות, אתרים או מערכות אחרות של הארגון באמצעות אינטגרציות. כך הארגון יכול לבחור כיצד להפעיל את השירותים ולשלב אותם בממשקים שבהם הוא כבר מתקשר עם הלקוחות או הקהילה שלו.',
      source: 'kb_seed',
    },
    {
      title: 'איך Nexus יוצרת ערך כלכלי לארגונים',
      content: 'Nexus מאפשרת לארגונים לחזק את הפעילות הכלכלית שלהם באמצעות שילוב של פתרונות נאמנות ותשלומים. המערכת מאפשרת לארגון להפעיל מועדון הטבות, לייצר פעילות צרכנית בתוך הקהילה שלו ולנהל תזרים כספי דרך פתרונות התשלום של הפלטפורמה. בנוסף, ארגונים יכולים ליצור מנועי הכנסה נוספים בהתאם למודל הפעילות שלהם, למשל באמצעות דמי חבר להשתתפות במועדון, שיתופי פעולה עם עסקים או שימוש במוצרים הפיננסיים של הפלטפורמה. מעבר להכנסות הישירות, הפלטפורמה גם מסייעת בחיזוק הקשר עם הקהילה, שימור משתמשים והגדלת המעורבות לאורך זמן.',
      source: 'kb_seed',
    },
    {
      title: 'Nexus היא אקו־סיסטם של פתרונות נאמנות ותשלומים',
      content: 'Nexus היא אקו־סיסטם של פתרונות נאמנות ותשלומים שמאפשר לארגונים לבנות, לחזק ולמנף את הקשר עם הקהילה שלהם. הפלטפורמה כוללת מגוון מוצרים משלימים כגון תוכניות נאמנות, מועדוני הטבות, פתרונות סליקה ותשלומים, הנפקת כרטיסים וארנקים דיגיטליים, מתנות ותקציבי רווחה לעובדים, שוברים דיגיטליים, וכן שירותים פיננסיים נוספים כמו חשבוניות ופקטורינג. מועדון ההטבות הוא רק אחד מהמוצרים בתוך המערכת הרחבה, והארגון יכול לבחור ולהפעיל את הפתרונות המתאימים לו מתוך ה-Dashboard של Nexus.',
      source: 'kb_seed',
    },
    {
      title: 'למה להשתמש ב-Nexus כאקו־סיסטם של פתרונות',
      content: 'האקו־סיסטם של Nexus משלב פתרונות נאמנות ופתרונות תשלומים במערכת אחת. בנייה עצמאית של מערכות כאלה היא מורכבת מאוד ודורשת ידע פיננסי, אינטגרציות עם ספקי תשלום, רגולציה וניהול שותפויות עם עסקים וספקים. Nexus מרכזת את כל היכולות האלו בפלטפורמה אחת, כך שהארגון יכול להפעיל פתרונות נאמנות, תשלומים ושיתופי פעולה עסקיים מבלי להקים ולנהל תשתית מורכבת בעצמו. הדבר מאפשר לארגונים להתמקד בפעילות המרכזית שלהם, בזמן שהמערכת מספקת את התשתית הטכנולוגית והפיננסית.',
      source: 'kb_seed',
    },
    {
      title: 'למי Nexus מתאימה',
      content: 'Nexus מתאימה לארגונים שיש להם קהילה של אנשים פרטיים שמתקשרים איתם באופן קבוע. הקהילה יכולה להיות עובדים, לקוחות, משתמשים, בוגרים, תלמידים, תורמים או ספקים. בכל מצב שבו לארגון יש קהילה והוא רוצה לחזק את הקשר איתה, לייצר נאמנות ולהניע פעילות כלכלית בין הארגון לבין חברי הקהילה — Nexus יכולה לספק את התשתית הטכנולוגית לכך.',
      source: 'kb_seed',
    },
    {
      title: 'אינטגרציות וכלי פיתוח ב-Nexus',
      content: 'Nexus מספקת מגוון כלים למפתחים המאפשרים התאמה מלאה של הפלטפורמה לצרכים של הארגון. ניתן להשתמש ב-APIs, Webhooks, SDKs ו-Embedded widgets כדי לשלב את השירותים בתוך אתרים, אפליקציות ומערכות קיימות. בנוסף, חלק מהפתרונות זמינים גם כ-White-label. הארגון יכול לבחור בין הקמה עצמית באמצעות מדריכים ותיעוד, או עבודה עם שותפי ההטמעה של Nexus שמסייעים בביצוע אינטגרציות ויישום המערכת.',
      source: 'kb_seed',
    },
    {
      title: 'סקייל והתאמה לארגונים שונים',
      content: 'Nexus בנויה כפלטפורמה סקיילבילית שיכולה להתאים למגוון רחב של ארגונים. המערכת יכולה לשרת החל מחברות גדולות מאוד ועד ארגונים קטנים וסטארטאפים. הארכיטקטורה של הפלטפורמה מאפשרת התאמה וקסטומיזציה לפי הצורך של הארגון, כך שניתן להפעיל פתרונות בקנה מידה קטן או גדול בהתאם לגודל הקהילה ולמודל הפעילות של הארגון.',
      source: 'kb_seed',
    },
    {
      title: 'איך משתמשי הקצה פוגשים את Nexus',
      content: 'ארגונים יכולים לבחור כיצד משתמשי הקצה שלהם יפגשו את הפתרונות של Nexus. ניתן להשתמש ב-Nexus כתשתית טכנולוגית בלבד ולבנות חוויית משתמש מותאמת באמצעות פיתוח עצמאי, תוך חיבור למערכת דרך APIs וכלי הפיתוח של הפלטפורמה. אפשרות נוספת היא להשתמש במוצרים המובנים של Nexus, הכוללים ממשקי משתמש מוכנים עם יכולות התאמה וקסטומיזציה. ברוב המקרים הארגון מטמיע את המערכות תחת המותג שלו, כך שהמשתמשים פוגשים את השירות כחלק מהמותג והפלטפורמה של הארגון.',
      source: 'kb_seed',
    },
    {
      title: 'איך מתחילים לעבוד עם Nexus',
      content: 'ניתן להתחיל לעבוד עם Nexus בצורה עצמאית דרך ה-Dashboard של הפלטפורמה. ארגונים יכולים להירשם למערכת ולהפעיל חלק מהפתרונות באופן מיידי, במיוחד במקרים פשוטים יחסית כמו מתנות לעובדים או פתרונות סליקה בסיסיים. עבור ארגונים גדולים יותר או פרויקטים מורכבים יותר, ניתן גם לקיים שיחה עם צוות Nexus כדי להבין את הצרכים ולבנות את הפתרון המתאים. בכל מקרה, הארגון יכול לבחור בין התחלה עצמאית לבין עבודה משותפת עם הצוות בהתאם למה שמתאים לו.',
      source: 'kb_seed',
    },
    {
      title: 'הבעיה ש-Nexus פותרת',
      content: 'רוב הארגונים מתמקדים בפעילות המרכזית שלהם – המוצר, השירות או המשימה שלהם. כאשר הם רוצים לחזק את הקשר עם הקהילה שלהם ולנהל פעילות כלכלית סביב אותה קהילה, הדבר דורש תשתיות מורכבות: פתרונות תשלום, תוכניות נאמנות, ניהול הטבות ושיתופי פעולה עם ספקים. בנייה וניהול של מערכות כאלה דורשים ידע פיננסי, טכנולוגי ותפעולי משמעותי. Nexus מספקת תשתית מלאה שמאפשרת לארגונים לנהל נאמנות, הטבות ותשלומים בצורה פשוטה מתוך Dashboard אחד. כך הארגון יכול לשמור את הקהילה ואת הפעילות הכלכלית סביבו, ולנהל אותה בקלות באמצעות הטכנולוגיה של Nexus.',
      source: 'kb_seed',
    },
    {
      title: 'איך Nexus עוזרת לארגונים',
      content: 'Nexus עוזרת לארגונים לחזק את הקשר עם הקהילה שלהם – עובדים, לקוחות, משתמשים או חברי קהילה – ולהפעיל סביב הקהילה פעילות כלכלית באמצעות פתרונות נאמנות ותשלומים. הפלטפורמה מאפשרת לארגון לנהל את הקהילה, ההטבות והפעילות הפיננסית בצורה פשוטה מתוך מערכת אחת.',
      source: 'kb_seed',
    },
  ];

  const existingChunks = await prisma.knowledgeChunk.count();
  if (existingChunks === 0) {
    for (const chunk of knowledgeChunks) {
      await prisma.knowledgeChunk.create({
        data: {
          title: chunk.title,
          content: chunk.content,
          source: chunk.source,
          language: 'he',
          isActive: true,
        },
      });
    }
    console.log(`✅ ${knowledgeChunks.length} knowledge chunks seeded (run embed-knowledge to generate embeddings)`);
  } else {
    console.log(`⏭️  Knowledge chunks already seeded (${existingChunks} rows) — skipping`);
  }

  // ─── Admin user ───────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@nexus.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Change-Me-Immediately-123!';

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      fullName: 'Nexus Admin',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'ADMIN',
      emailVerified: true,
    },
    update: {},
  });
  console.log(`✅ Admin user: ${adminEmail}`);

  // ─── Partner brands (from Wix CMS CSV, 71 entries) ───────
  const existingPartners = await prisma.partner.count();
  if (existingPartners === 0) {
    const cdn = (hash: string) => `https://static.wixstatic.com/media/${hash}`;
    await prisma.partner.createMany({
      data: [
        { title: 'Bakers Secret',           thumbnailUrl: cdn('57cf68_0667346f0d33491cb792cbf54f182586~mv2.png'),  categories: ['למטבח'],                    order: 1  },
        { title: 'Masu',                    thumbnailUrl: cdn('57cf68_af18b1c2a0724f2b883abc537bc92c1d~mv2.png'),  categories: ['פנאי','וולנס','אטרקציות'],   order: 2  },
        { title: 'Samsung',                 thumbnailUrl: cdn('57cf68_692ecad80093476ab9c39c8ad410156d~mv2.png'),  categories: ['אלקטרוניקה'],                order: 3  },
        { title: 'Kitan',                   thumbnailUrl: cdn('57cf68_8d7660918aa54c71a25879dc5d4f10f1~mv2.png'),  categories: ['ביגוד','לבית'],              order: 4  },
        { title: 'Fox Home',                thumbnailUrl: cdn('57cf68_1ebf982869da4db9a5faebe7f0be29b4~mv2.png'),  categories: ['לבית'],                     order: 5  },
        { title: 'Polgat',                  thumbnailUrl: cdn('57cf68_07b2414566094323824dbfbc15876b9b~mv2.png'),  categories: ['ביגוד'],                    order: 6  },
        { title: 'Adika',                   thumbnailUrl: cdn('57cf68_fead33ba679a47ffa55e2276ed416e9e~mv2.png'),  categories: ['ביגוד'],                    order: 7  },
        { title: 'הסיירת',                  thumbnailUrl: cdn('57cf68_5de64462d43d4c63a25d5b5511bc8a4d~mv2.png'),  categories: ['שטח','טיולים'],             order: 8  },
        { title: 'SACKS',                   thumbnailUrl: cdn('57cf68_c0cafba8eab74e6dbcbb9f74105d4477~mv2.png'),  categories: ['נשים','ביגוד'],             order: 9  },
        { title: 'Protein 4 U',             thumbnailUrl: cdn('57cf68_201b2afba9334ad39087bb9a2f767937~mv2.png'),  categories: ['מזון'],                     order: 10 },
        { title: 'Minene',                  thumbnailUrl: cdn('57cf68_d1e0c430200648c58c443ea446c9ac80~mv2.png'),  categories: ['ילדים'],                    order: 11 },
        { title: 'שילב',                    thumbnailUrl: cdn('57cf68_02665a6f757e4174bfc27a2eee0b5bd7~mv2.png'),  categories: ['ילדים','ביגוד'],            order: 12 },
        { title: 'Ruby Bay',                thumbnailUrl: cdn('57cf68_67b0c1e12112455aa224e763e5798455~mv2.png'),  categories: ['ביגוד'],                    order: 13 },
        { title: 'טרקלין חשמל',             thumbnailUrl: cdn('57cf68_8b33c0ec4435418e8195b1c3fadfb261~mv2.png'),  categories: ['אלקטרוניקה'],                order: 14 },
        { title: 'American Eagle',          thumbnailUrl: cdn('57cf68_d4568921d1044762a7a9e8a8acc2fc88~mv2.png'),  categories: ['ביגוד'],                    order: 15 },
        { title: 'צעד 4 על 4',             thumbnailUrl: cdn('57cf68_c01b769080e547fa98e186811c3cfc02~mv2.png'),  categories: ['רכב','שטח'],               order: 16 },
        { title: 'Dynamica',               thumbnailUrl: cdn('57cf68_72e855b8ebd64dfe805f1743258bbd64~mv2.png'),  categories: ['אלקטרוניקה'],                order: 17 },
        { title: 'Rudy Project',            thumbnailUrl: cdn('57cf68_b1b0b2e404e94a94a900d8d525a7fe3e~mv2.png'),  categories: ['אופטיקה','ספורט'],          order: 18 },
        { title: 'יער הקופים',              thumbnailUrl: cdn('57cf68_ebf8090268e746c09be7247683dd41b6~mv2.png'),  categories: ['אטרקציות'],                 order: 19 },
        { title: 'IBI',                     thumbnailUrl: cdn('57cf68_b349cc4a2ac44ac4b525fd9b3d30a811~mv2.png'),  categories: ['פיננסים'],                  order: 20 },
        { title: 'Brisket',                 thumbnailUrl: cdn('57cf68_99a42e08c7c946d3b376c23b898e2e28~mv2.png'),  categories: ['מזון','אוכל'],              order: 21 },
        { title: 'Sunglass Hut',            thumbnailUrl: cdn('57cf68_40b0970c66314afc8ef69e1e371ae630~mv2.png'),  categories: ['אופטיקה'],                  order: 22 },
        { title: 'Bonita De Mas',           thumbnailUrl: cdn('57cf68_de1e0d98ea1145b98ba5c813cedf65ac~mv2.png'),  categories: ['ביגוד','נשים'],             order: 23 },
        { title: 'אקסלנס טרייד',            thumbnailUrl: cdn('57cf68_cc995b1882f441fab92ea4dfb6a0b398~mv2.png'),  categories: ['פיננסים'],                  order: 24 },
        { title: 'דקה 90',                  thumbnailUrl: cdn('57cf68_8ac1fc1347a6429dac3f4f3fd10cd212~mv2.png'),  categories: ['נופש','טיולים'],            order: 25 },
        { title: 'Castro Home',             thumbnailUrl: cdn('57cf68_cc3f23f6e1cd48be9ed849e0d5b5ccea~mv2.png'),  categories: ['לבית'],                     order: 26 },
        { title: 'ENERGYM',                 thumbnailUrl: cdn('57cf68_d7791e06efe348ec961e9f4497453813~mv2.png'),  categories: ['ספורט'],                    order: 27 },
        { title: 'Carolina Lamke',          thumbnailUrl: cdn('57cf68_815fbf7025ea4a19b370498f09155acb~mv2.png'),  categories: ['אופטיקה'],                  order: 28 },
        { title: 'Fly Box',                 thumbnailUrl: cdn('57cf68_77a98a3fe26b4147b6c3d002329481ac~mv2.png'),  categories: ['אטרקציות'],                 order: 29 },
        { title: 'כפר הצוללים',             thumbnailUrl: cdn('57cf68_f1eaaf86ac7244c1a027a110ddf4c35f~mv2.png'),  categories: ['אטרקציות'],                 order: 30 },
        { title: 'Magnus',                  thumbnailUrl: cdn('57cf68_c16d378b7f9b4b6db6939d457ebb0e98~mv2.png'),  categories: ['טיולים','שטח'],             order: 31 },
        { title: 'Rise Up',                 thumbnailUrl: cdn('57cf68_fdf7fb0bc8324bbab90cc66f9487595d~mv2.png'),  categories: ['פיננסים'],                  order: 32 },
        { title: 'רמי לוי שיווק השקמה',    thumbnailUrl: cdn('57cf68_f1856e65180f449691de0b3298d873d6~mv2.png'),  categories: ['מזון'],                     order: 33 },
        { title: 'Golf Kids',               thumbnailUrl: cdn('57cf68_83e18f3a67234d0c9fec6a4dc805425d~mv2.png'),  categories: ['ילדים'],                    order: 34 },
        { title: 'רפטינג נהר הירדן',        thumbnailUrl: cdn('57cf68_c134cf15b3f944f2a5f281440899c7e5~mv2.jpeg'), categories: ['אטרקציות'],                 order: 35 },
        { title: 'Billabong',               thumbnailUrl: cdn('57cf68_c2ffcb43ccfa491b9648a82c85ebf772~mv2.png'),  categories: ['ביגוד'],                    order: 36 },
        { title: 'Laline',                  thumbnailUrl: cdn('57cf68_db16f7cb7fa24bc5a07c8b17dad06ce6~mv2.png'),  categories: ['לבית','קוסמטיקה'],          order: 37 },
        { title: 'המשביר לצרכן',            thumbnailUrl: cdn('57cf68_ef07ca6f6c964dfda38cc7d1f99c3a06~mv2.png'),  categories: ['ביגוד'],                    order: 38 },
        { title: 'Foot Locker',             thumbnailUrl: cdn('57cf68_e39743ebae1649139abb6f4a85cf83f3~mv2.png'),  categories: ['ספורט'],                    order: 39 },
        { title: 'Home Style',              thumbnailUrl: cdn('57cf68_0179e0cfd6e4438091bdb1f8fef0b28c~mv2.png'),  categories: ['לבית'],                     order: 40 },
        { title: 'בירה מלכה',               thumbnailUrl: cdn('57cf68_db3f3ce7ff524b58978b807e2059d883~mv2.png'),  categories: ['מזון','אוכל'],              order: 41 },
        { title: 'INTIMA',                  thumbnailUrl: cdn('57cf68_b2ad5e9ee2fa45fc844a2df78ef7f454~mv2.png'),  categories: ['נשים','ביגוד'],             order: 42 },
        { title: 'Golf & Co',               thumbnailUrl: cdn('57cf68_e0dce955452d4e99aea2c59d392f359e~mv2.png'),  categories: ['לבית'],                     order: 43 },
        { title: 'Boardriders',             thumbnailUrl: cdn('57cf68_24988fe11ef34be088f633224dc76250~mv2.png'),  categories: ['ביגוד'],                    order: 44 },
        { title: 'Garmin',                  thumbnailUrl: cdn('57cf68_c686e26d031c444ea65c8e90435dd0c5~mv2.png'),  categories: ['ספורט','אלקטרוניקה'],       order: 45 },
        { title: 'Mango',                   thumbnailUrl: cdn('57cf68_d61519017e0645428cc76af041571006~mv2.png'),  categories: ['ביגוד'],                    order: 46 },
        { title: 'YANGA',                   thumbnailUrl: cdn('57cf68_6e4826b4c81b47ed953a17431e9fb267~mv2.png'),  categories: ['נשים','ביגוד'],             order: 47 },
        { title: 'Urbanica',                thumbnailUrl: cdn('57cf68_c37a6ad3e2dc49848686ed84f1b4aa18~mv2.png'),  categories: ['ביגוד','לבית','נשים'],      order: 48 },
        { title: 'מיטב טרייד',              thumbnailUrl: cdn('57cf68_6fb7d4d167f94809bcfd2e138aee1582~mv2.png'),  categories: ['פיננסים'],                  order: 49 },
        { title: 'Kiko Milano',             thumbnailUrl: cdn('57cf68_0d73d60aa3804110bbbb3a91bb152873~mv2.png'),  categories: ['איפור','נשים'],             order: 50 },
        { title: 'ישראייר',                 thumbnailUrl: cdn('57cf68_b8aca9d3726147e494f9e53b6b6678c1~mv2.png'),  categories: ['נופש','טיולים'],            order: 51 },
        { title: 'Spa Plus',                thumbnailUrl: cdn('57cf68_aa81157fd513441bb21e0b8b3839e1f7~mv2.png'),  categories: ['פנאי','וולנס','אטרקציות'],   order: 52 },
        { title: 'נעמן',                    thumbnailUrl: cdn('57cf68_1681c450871e48fcaf4a471ccd20a42c~mv2.png'),  categories: ['לבית','למטבח'],             order: 53 },
        { title: 'Arie',                    thumbnailUrl: cdn('57cf68_31f8c1e646874214a12a036d1b2ea32b~mv2.png'),  categories: ['נשים','ביגוד'],             order: 54 },
        { title: 'ורדינון',                 thumbnailUrl: cdn('57cf68_fd2584f7f7b541e4876bdd3abf5d7efb~mv2.png'),  categories: ['לבית'],                     order: 55 },
        { title: 'Brooks',                  thumbnailUrl: cdn('57cf68_91e95c2bda9f4493a518610fa9d96cc9~mv2.png'),  categories: ['ביגוד','ספורט'],            order: 56 },
        { title: 'Budget',                  thumbnailUrl: cdn('57cf68_2f7d850ca5314bdfbd9ac792079b064f~mv2.png'),  categories: ['רכב'],                      order: 57 },
        { title: 'Kernelios',               thumbnailUrl: cdn('57cf68_15f8e9f28ef7431eabced9adfebb50e3~mv2.png'),  categories: ['הכשרות','קורסים'],          order: 58 },
        { title: 'מכון וקסלר',              thumbnailUrl: cdn('57cf68_83ca95d3d56e4fb499175a7dd829e3b7~mv2.png'),  categories: ['הכשרות','קורסים','ספורט'],   order: 59 },
        { title: 'IRobot',                  thumbnailUrl: cdn('57cf68_c16be0df803d47649e10e661c513a37f~mv2.png'),  categories: ['אלקטרוניקה'],                order: 60 },
        { title: 'Hoodies',                 thumbnailUrl: cdn('57cf68_9a322895229a429292af094d9af1beac~mv2.png'),  categories: ['ביגוד'],                    order: 61 },
        { title: 'בית קנדינוף',             thumbnailUrl: cdn('57cf68_a69cda4d458d4a13b8a7c8c659116c73~mv2.png'),  categories: ['אוכל','מזון'],              order: 62 },
        { title: 'Yves Rocher',             thumbnailUrl: cdn('57cf68_337a648303de474398f578adea0e4192~mv2.png'),  categories: ['קוסמטיקה'],                 order: 63 },
        { title: 'Afrodita',                thumbnailUrl: cdn('57cf68_104d56f15cbe41f283938cc69cf3b271~mv2.png'),  categories: ['נשים'],                     order: 64 },
        { title: 'Converse',                thumbnailUrl: cdn('57cf68_8bec64b8bd7d47778814522a4b75e83c~mv2.png'),  categories: ['ביגוד'],                    order: 65 },
        { title: 'GOOL',                    thumbnailUrl: cdn('57cf68_8afb18cc84d14984ae2722226d835b1d~mv2.png'),  categories: ['קורסים'],                   order: 66 },
        { title: 'Ovali',                   thumbnailUrl: cdn('57cf68_14f60b18c7c84e26b483dbfd45acdd4f~mv2.png'),  categories: ['אלקטרוניקה'],                order: 67 },
        { title: 'Homonugus',               thumbnailUrl: cdn('57cf68_4dff6246bf9d4e07a32c5f037a0bf850~mv2.png'),  categories: ['אוכל','מזון'],              order: 68 },
        { title: 'קסטרו',                   thumbnailUrl: cdn('57cf68_70b1110168e341f8b82ab3fdf5172a3b~mv2.png'),  categories: ['ביגוד'],                    order: 69 },
        { title: 'Kenneth Cole',            thumbnailUrl: cdn('57cf68_f51a21742935496ab8b8089bec196014~mv2.png'),  categories: ['ביגוד'],                    order: 70 },
        { title: 'Top Ten',                 thumbnailUrl: cdn('57cf68_9abad9ad8c954eaf900c2ba411d6dbe1~mv2.png'),  categories: ['אקססוריס','תכשיטים'],       order: 71 },
      ],
    });
    console.log('✅ 71 partners seeded');
  } else {
    console.log(`⏭️  Partners already seeded (${existingPartners} rows) — skipping`);
  }

  // ─── Blog Articles ────────────────────────────────────────
  await seedBlogArticlesIfEmpty();

  console.log('🌱 Seed complete!');
}

async function seedBlogArticlesIfEmpty() {
  const existing = await prisma.blogArticle.count();
  if (existing > 0) {
    console.log(`⏭️  Blog articles already seeded (${existing} rows) — skipping`);
    return;
  }

  // Dynamic import to avoid rootDir restrictions
  // @ts-ignore
  const { articlesEn } = await import('../../src/data/blog/articles-en');
  // @ts-ignore
  const { articlesHe } = await import('../../src/data/blog/articles-he');

  const allArticles = [
    ...articlesEn.map((a: any) => ({ ...a, lang: 'en' })),
    ...articlesHe.map((a: any) => ({ ...a, lang: 'he' })),
  ];

  for (const article of allArticles) {
    await prisma.blogArticle.upsert({
      where: { slug_lang: { slug: article.slug, lang: article.lang } },
      create: {
        slug: article.slug,
        lang: article.lang,
        status: 'PUBLISHED',
        title: article.title,
        subtitle: article.subtitle ?? null,
        excerpt: article.excerpt ?? null,
        heroImage: article.heroImage ?? null,
        metaTitle: article.metaTitle ?? null,
        metaDescription: article.metaDescription ?? null,
        category: article.category ?? null,
        authorName: article.author?.name ?? null,
        authorRole: article.author?.role ?? null,
        authorAvatar: article.author?.avatar ?? null,
        publishDate: article.publishDate ? new Date(article.publishDate) : null,
        readTime: article.readTime ?? null,
        sectionsJson: article.sections ?? [],
        faqJson: article.faq ?? null,
        publishedAt: article.publishDate ? new Date(article.publishDate) : new Date(),
      },
      update: {},
    });
  }

  console.log(`✅ ${allArticles.length} blog articles seeded`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
