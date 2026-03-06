import 'dotenv/config'; // Load .env before anything else
import http from 'http';
import app from './app';
import { initSocket } from './socket';
import { env } from './config/env';
import { prisma } from './config/database';
import { scheduleDailyDigest } from './jobs/dailyDigest';
import { embedText } from './services/ai.service';

const PORT = env.PORT;

// ─── Auto-seed knowledge base on first run ────────────────
async function seedKnowledgeIfEmpty() {
  const count = await prisma.knowledgeChunk.count();
  if (count > 0) return; // Already seeded

  console.log('📚 No knowledge chunks found — auto-seeding...');

  // Ensure AI config exists
  await prisma.aiConfig.upsert({
    where: { key: 'system_prompt' },
    create: {
      key: 'system_prompt',
      value: `אתה נציג תמיכה ומכירות של Nexus — אקו־סיסטם של פתרונות נאמנות ותשלומים.\nעונה תמיד בעברית, בנימה מקצועית אך ידידותית וחמה.\n\nהנחיות:\n• הבן את צורך הלקוח ב-1-2 שאלות לפני שאתה ממליץ\n• תשובות קצרות ולעניין — עד 3 משפטים\n• אם הלקוח מעוניין בדמו או שאלה טכנית מורכבת — הצע נציג אנושי\n• אל תמציא מחירים — השתמש רק בפרטים מהידע שסופק לך\n• אם אין לך תשובה מדויקת — אמור בכנות ותציע נציג\n• אם הלקוח מבקש נציג אנושי — ענה: ESCALATE`,
      description: 'הנחיות מערכת ל-AI assistant בצ\'אט',
    },
    update: {},
  });

  const chunks = [
    { title: 'מה זה Nexus', content: 'Nexus היא פלטפורמת נאמנות ותשלומים שמאפשרת לארגונים לחזק את הקשר עם הקהילה שלהם — לקוחות, עובדים, משתמשים, בוגרים או תורמים — וליצור פעילות כלכלית סביב הקהילה באמצעות פתרונות נאמנות, הטבות ותשלומים.' },
    { title: 'מי משתמש ב-Nexus', content: 'Nexus עובדת עם מגוון רחב של ארגונים ועסקים: רשתות קמעונאיות, ארגונים ממשלתיים, עמותות, ארגוני בוגרים, חברות ביטוח, עסקים קטנים ובינוניים. הפלטפורמה מתאימה לכל ארגון שמעוניין לחזק את הקשר עם הקהילה שלו.' },
    { title: 'פלטפורמת הטבות ומועדון צרכנות', content: 'Nexus מאפשרת לארגונים להפעיל מועדון הטבות דיגיטלי. חברי המועדון יכולים לגשת להטבות בתחומים כמו צרכנות, אלקטרוניקה, נופש, אופנה ושירותים. ההטבות יכולות להיות שוברים דיגיטליים, קופונים, או השארת פרטים לספקים.' },
    { title: 'ניהול שוברים וכרטיסי מתנה דיגיטליים', content: 'המערכת מאפשרת ליצור, לנהל ולמכור שוברים דיגיטליים וכרטיסי מתנה. משתמשים יכולים לרכוש שובר, לקבל קוד דיגיטלי ולממש אותו אצל הספק. ניתן להגדיר ערך, הנחה, תנאי שימוש ותוקף.' },
    { title: 'תוכניות נאמנות וצבירת נקודות', content: 'Nexus מאפשרת להפעיל תוכניות נאמנות מתקדמות כמו צבירת נקודות, החזר כספי או הטבות מותאמות. ארגונים יכולים להגדיר חוקים לצבירה ומימוש של נקודות וליצור תגמולים לחברי הקהילה.' },
    { title: 'אילו מוצרים יש ב-Nexus', content: 'Nexus מציעה: מועדוני הטבות, תוכניות נאמנות, מתנות ותקציבי רווחה לעובדים, שוברים דיגיטליים, פתרונות סליקה ותשלומים, הנפקת כרטיסים וארנקים דיגיטליים, וכן שירותים פיננסיים נוספים כמו חשבוניות ופקטורינג.' },
    { title: 'היתרונות של Nexus', content: 'Nexus משלבת פתרונות נאמנות ותשלומים במערכת אחת. הפלטפורמה מאפשרת לארגונים להפוך קהילה קיימת למנוע כלכלי באמצעות הטבות, שוברים ופעילות צרכנית. Nexus מחברת בין עסקים לקהילות משתמשים ומאפשרת לעסקים להציע הטבות בתוך המועדונים.' },
    { title: 'מודל ההכנסות של Nexus', content: 'המודל העסקי מבוסס על מנוי חודשי לארגון (subscription), ובנוסף רכיבים כמו עמלות על עסקאות, עמלות סליקה, עמלות על שיתופי פעולה עם עסקים, ועמלות פיננסיות במוצרים מתקדמים.' },
    { title: 'זמן הקמה של פתרונות Nexus', content: 'מתנות לעובדים או מועדון הטבות פועלים כמעט מיד. פתרונות סליקה — עד כשבועיים. פתרונות מתקדמים כמו הנפקת כרטיסים וארנקים דיגיטליים — עד כארבעה חודשים.' },
    { title: 'אינטגרציות וכלי פיתוח', content: 'Nexus מספקת APIs, Webhooks, SDKs ו-Embedded widgets לשילוב בתוך אתרים, אפליקציות ומערכות קיימות. ניתן גם להשתמש בפתרונות White-label.' },
    { title: 'למה להשתמש ב-Nexus ולא לבנות פתרון בעצמנו', content: 'בניית מערכת שמשלבת נאמנות ותשלומים דורשת תשתית פיננסית מורכבת, אינטגרציות עם ספקי תשלום וניהול שותפויות. Nexus מרכזת את כל היכולות האלו בפלטפורמה אחת.' },
    { title: 'למי Nexus מתאימה', content: 'Nexus מתאימה לארגונים שיש להם קהילה של אנשים — עובדים, לקוחות, משתמשים, בוגרים, תלמידים או תורמים. כאשר ארגון רוצה לחזק את הקשר עם הקהילה שלו וליצור פעילות כלכלית.' },
    { title: 'סקייל והתאמה', content: 'Nexus בנויה כפלטפורמה סקיילבילית שיכולה להתאים גם לארגונים קטנים וגם לארגונים גדולים מאוד. ניתן להפעיל פתרונות בקנה מידה קטן או גדול.' },
    { title: 'הבעיה ש-Nexus פותרת', content: 'ארגונים רוצים לחזק את הקשר עם הקהילה שלהם ולנהל פעילות כלכלית סביבה, אבל בנייה של תשתיות נאמנות ותשלומים היא מורכבת. Nexus מספקת תשתית מלאה לניהול נאמנות, הטבות ותשלומים מתוך Dashboard אחד.' },
    { title: 'איך מתחילים לעבוד עם Nexus', content: 'ניתן להתחיל בצורה עצמאית דרך ה-Dashboard. במקרים פשוטים כמו מתנות לעובדים או סליקה בסיסית ניתן להתחיל לעבוד מיד. לפרויקטים מורכבים ניתן לקבוע שיחה עם הצוות.' },
  ];

  // Generate embeddings inline if OpenAI key is available
  const canEmbed = !!env.OPENAI_API_KEY;
  if (!canEmbed) {
    console.log('⚠️  OPENAI_API_KEY not set — seeding without embeddings');
  }

  let ok = 0;
  for (const chunk of chunks) {
    let embedding: number[] = [];
    if (canEmbed) {
      try {
        embedding = await embedText(`${chunk.title}\n${chunk.content}`);
        ok++;
      } catch (e) {
        console.error(`  embed failed: ${chunk.title}`, (e as Error).message);
      }
    }
    await prisma.knowledgeChunk.create({
      data: { title: chunk.title, content: chunk.content, source: 'kb_seed', language: 'he', isActive: true, embedding },
    });
  }
  console.log(`✅ ${chunks.length} knowledge chunks seeded (${ok} with embeddings)`);
}

async function bootstrap() {
  // 1. Test DB connection
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }

  // 2. Auto-seed knowledge base on first boot
  try {
    await seedKnowledgeIfEmpty();
  } catch (err) {
    console.error('⚠️  Knowledge seed failed (non-fatal):', (err as Error).message);
  }

  // 4. Create HTTP server + Socket.io
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  console.log('✅ Socket.io initialized');

  // 5. Schedule cron jobs
  scheduleDailyDigest();
  console.log('✅ Cron jobs scheduled');

  // 6. Start listening
  httpServer.listen(PORT, () => {
    console.log(`🚀 Nexus backend running on port ${PORT} [${env.NODE_ENV}]`);
  });

  // 7. Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received — shutting down gracefully');
    httpServer.close(async () => {
      await prisma.$disconnect();
      console.log('Server closed');
      process.exit(0);
    });
  });
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
