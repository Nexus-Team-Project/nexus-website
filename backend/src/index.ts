import 'dotenv/config'; // Load .env before anything else

// ─── Process-level crash protection ─────────────────────────
// Prevents silent crashes on unhandled promise rejections (Node 20+ default)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  console.error('[FATAL] Promise:', promise);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

import http from 'http';
import app from './app';
import { initSocket } from './socket';
import { env } from './config/env';
import { prisma } from './config/database';
import { closeMongoConnection, getMongoDb, verifyMongoConnection } from './config/mongo';
import { ensureDomainIndexes } from './models/domain';
import { ensureOnboardingIndexes } from './models/onboarding.models';
import { scheduleDailyDigest } from './jobs/dailyDigest';
import { embedText } from './services/ai.service';
import { scheduleBiRefresh } from './jobs/biRefresh';
import { pollInbox } from './services/outlook-inbound.service';
import * as GreenApi from './services/greenapi.service';

const PORT = env.PORT;
const BACKEND_URL = env.BACKEND_URL ?? env.FRONTEND_URL;

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

// ─── Seed technical knowledge chunks (idempotent) ──────
async function seedTechnicalChunks() {
  const techChunks = [
    {
      title: 'API ואינטגרציות — סקירה כללית',
      content: `Nexus מספקת REST API מלא עם אימות JWT ומפתח API. ה-API מאפשר ניהול מועדונים, הטבות, שוברים, עסקאות ולקוחות באופן פרוגרמטי. Rate limit: 100 בקשות/דקה (Standard), 500/דקה (Enterprise). תיעוד מלא זמין ב-nexus-api-docs-production.up.railway.app. SDKs זמינים ל-JavaScript, React, Node.js ו-Python.`,
    },
    {
      title: 'מערכת Webhooks',
      content: `Nexus שולחת Webhooks בזמן אמת לאירועים כמו: עסקה חדשה, מימוש שובר, הרשמה למועדון, עדכון פרופיל. כל Webhook מאובטח עם HMAC-SHA256 signature. ניתן להגדיר URLs שונים לכל סוג אירוע דרך ה-Dashboard או דרך ה-API. Retry policy: 3 ניסיונות עם exponential backoff.`,
    },
    {
      title: 'יכולות White-Label',
      content: `Nexus מאפשרת לשלב את הפתרונות כ-White-Label בתוך האפליקציה או האתר של הארגון. ניתן להתאים צבעים, לוגו, פונטים ודומיין מותאם אישית. Embedded widgets מאפשרים להטמיע רכיבי UI (כמו כרטיס הטבות, ארנק דיגיטלי) ישירות באתר. Custom domains נתמכים עם SSL אוטומטי.`,
    },
    {
      title: 'SDKs וספריות קוד',
      content: `Nexus מספקת SDKs רשמיים: JavaScript (Browser), React Components, Node.js Server SDK, ו-Python SDK. ה-React SDK כולל רכיבים מוכנים כמו <BenefitCard>, <WalletWidget>, <LoyaltyPoints>. Server SDKs כוללים type-safe clients עם TypeScript definitions מלאים. התקנה דרך npm/pip.`,
    },
    {
      title: 'אבטחה ופרטיות נתונים',
      content: `Nexus עומדת בתקני PCI-DSS Level 1 לעיבוד תשלומים. כל הנתונים מוצפנים ב-AES-256 ובמעבר ב-TLS 1.3. התאימות ל-GDPR כוללת: זכות למחיקה, ייצוא נתונים, DPA, ואחסון בשרתים באירופה. SOC 2 Type II בתהליך. Two-factor authentication זמין לכל חשבון admin.`,
    },
    {
      title: 'מדריך התחלה מהירה למפתחים',
      content: `להתחיל לעבוד עם Nexus API: 1) הירשם ב-Dashboard וצור API Key. 2) התקן SDK: npm install @nexus/sdk. 3) אתחל: const nexus = new Nexus({ apiKey: 'YOUR_KEY' }). 4) צור מועדון ראשון: nexus.clubs.create({ name: '...' }). 5) הוסף חברים והטבות. תיעוד מלא עם דוגמאות קוד זמין בעמוד ה-API Docs.`,
    },
  ];

  const canEmbed = !!env.OPENAI_API_KEY;
  let added = 0;

  for (const chunk of techChunks) {
    const exists = await prisma.knowledgeChunk.findFirst({ where: { title: chunk.title } });
    if (exists) continue;

    let embedding: number[] = [];
    if (canEmbed) {
      try { embedding = await embedText(`${chunk.title}\n${chunk.content}`); } catch {}
    }
    await prisma.knowledgeChunk.create({
      data: { title: chunk.title, content: chunk.content, source: 'kb_seed_tech', language: 'he', isActive: true, embedding },
    });
    added++;
  }

  if (added > 0) console.log(`📚 Seeded ${added} technical knowledge chunks`);

  // Also seed technical few-shot examples
  const techExamples = [
    {
      question: 'יש לכם API?',
      answer: 'בהחלט! Nexus מספקת REST API מלא עם תיעוד מפורט, אימות JWT ו-SDKs ל-JavaScript, React, Node.js ו-Python. אתה יכול לנהל מועדונים, הטבות, שוברים ועסקאות באופן פרוגרמטי. [NAV:api_docs]',
      category: 'technical',
    },
    {
      question: 'אפשר לשלב את Nexus באפליקציה שלנו?',
      answer: 'כן, Nexus תוכננה בדיוק בשביל זה. יש לנו Embedded Widgets שמטמיעים ישירות באתר שלכם, SDKs עם React Components מוכנים, ו-REST API מלא. ניתן גם לעבוד ב-White-Label עם דומיין מותאם. [NAV:api_docs]',
      category: 'technical',
    },
    {
      question: 'מה לגבי אבטחה?',
      answer: 'האבטחה ב-Nexus ברמה הגבוהה ביותר: PCI-DSS Level 1 לתשלומים, הצפנת AES-256, TLS 1.3, תאימות GDPR מלאה כולל זכות מחיקה וייצוא נתונים, ו-2FA לכל חשבון. SOC 2 Type II בתהליך.',
      category: 'technical',
    },
    {
      question: 'כמה זמן לוקח להקים מועדון הטבות?',
      answer: 'מועדון הטבות בסיסי יכול לפעול תוך דקות דרך ה-Dashboard שלנו. פתרונות סליקה — עד כשבועיים. פתרונות מתקדמים כמו כרטיסים וארנקים דיגיטליים — עד 4 חודשים. רוצה שנתאם שיחה כדי לתכנן את ההטמעה? [NAV:schedule]',
      category: 'sales',
    },
  ];

  let examplesAdded = 0;
  for (const ex of techExamples) {
    const exists = await prisma.aiExample.findFirst({ where: { question: ex.question } });
    if (exists) continue;
    await prisma.aiExample.create({
      data: { question: ex.question, answer: ex.answer, category: ex.category, isActive: true },
    });
    examplesAdded++;
  }
  if (examplesAdded > 0) console.log(`📝 Seeded ${examplesAdded} AI few-shot examples`);
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

  // 1b. Test MongoDB connection and prepare product-domain indexes.
  try {
    await verifyMongoConnection();
    const mongoDb = await getMongoDb();
    await ensureOnboardingIndexes(mongoDb);
    await ensureDomainIndexes(mongoDb);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  }

  // 2. Auto-seed knowledge base on first boot
  try {
    await seedKnowledgeIfEmpty();
    await seedTechnicalChunks();
  } catch (err) {
    console.error('⚠️  Knowledge seed failed (non-fatal):', (err as Error).message);
  }

  // 4. Create HTTP server + Socket.io
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  console.log('✅ Socket.io initialized');

  // 5. Schedule cron jobs
  scheduleDailyDigest();
  scheduleBiRefresh();

  // 6. Green API — auto-fix outgoing webhook settings on startup
  if (env.GREEN_API_ID_INSTANCE && env.GREEN_API_TOKEN) {
    const webhookUrl = `${BACKEND_URL}/api/webhooks/greenapi`;
    GreenApi.ensureOutgoingWebhooksEnabled(webhookUrl)
      .then(({ changed, settings }) => {
        if (changed) {
          console.log('✅ Green API settings auto-fixed (outgoing webhooks enabled)');
        } else {
          console.log('✅ Green API settings OK');
        }
        console.log(`   webhookUrl=${settings?.webhookUrl ?? 'N/A'} outgoing=${settings?.outgoingWebhook ?? 'N/A'} outgoingMsg=${settings?.outgoingMessageWebhook ?? 'N/A'}`);
      })
      .catch((err: Error) => {
        console.warn('⚠️  Green API settings check failed (non-fatal):', err.message);
      });
  }

  // 7. Outlook inbox polling (every 30s)
  if (env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.MS_MAILBOX) {
    setInterval(() => pollInbox().catch(console.error), 30_000);
    // Run immediately on startup
    pollInbox().catch(console.error);
    console.log(`✅ Outlook inbox polling active (${env.MS_MAILBOX})`);
  } else {
    console.warn('⚠️  Outlook inbox polling disabled — MS_TENANT_ID/CLIENT_ID/CLIENT_SECRET/MS_MAILBOX not set');
  }

  console.log('✅ Cron jobs scheduled');

  // 7. Start listening
  httpServer.listen(PORT, () => {
    console.log(`🚀 Nexus backend running on port ${PORT} [${env.NODE_ENV}]`);
  });

  // 8. Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received — shutting down gracefully');
    httpServer.close(async () => {
      await prisma.$disconnect();
      await closeMongoConnection();
      console.log('Server closed');
      process.exit(0);
    });
  });
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
