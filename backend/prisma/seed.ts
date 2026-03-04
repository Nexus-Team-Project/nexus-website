import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Enable pgvector extension ────────────────────────────
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('✅ pgvector extension enabled');

  // ─── Default AI system prompt ─────────────────────────────
  await prisma.aiConfig.upsert({
    where: { key: 'system_prompt' },
    create: {
      key: 'system_prompt',
      value: `אתה נציג תמיכה ומכירות של Nexus — פלטפורמת תשלומים ופינטק מובילה.
עונה תמיד בעברית, בנימה מקצועית אך ידידותית וחמה.

הנחיות:
• הבן את צורך הלקוח ב-1-2 שאלות לפני שאתה ממליץ
• תשובות קצרות ולעניין — עד 3 משפטים
• אם הלקוח מעוניין בדמו או שאלה טכנית מורכבת — הצע נציג אנושי
• אל תמציא מחירים — השתמש רק בפרטים מהידע שסופק לך
• אם אין לך תשובה מדויקת — אמור בכנות ותציע נציג
• אם הלקוח מבקש נציג אנושי — ענה: ESCALATE

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

  // ─── Seed few-shot examples ───────────────────────────────
  const examples = [
    {
      question: 'כמה עולה Nexus?',
      answer: 'יש לנו מספר תוכניות — החל מ-₪199/חודש לעסקים קטנים ועד פתרונות Enterprise מותאמים אישית. רוצה שאמסור לך פרטים על תוכנית ספציפית?',
      category: 'pricing',
    },
    {
      question: 'האם אפשר לקבל דמו?',
      answer: 'בהחלט! אני מחבר אותך לנציג שיקבע איתך הדגמה אישית בהתאם לצרכים שלך.',
      category: 'demo',
    },
    {
      question: 'איך מתחברים ל-API שלכם?',
      answer: 'ה-API שלנו מבוסס REST עם אותנטיקציה OAuth2. יש לנו SDK ל-Node.js, Python ו-PHP. רוצה שאחבר אותך לתיעוד הטכני או לנציג טכני?',
      category: 'technical',
    },
    {
      question: 'מה זמן השבת לשאלות תמיכה?',
      answer: 'צוות התמיכה שלנו זמין ראשון עד שישי 09:00–18:00. לפניות דחופות יש לנו תמיכה 24/7 ל-Enterprise.',
      category: 'support',
    },
  ];

  for (const ex of examples) {
    await prisma.aiExample.upsert({
      where: { id: `seed_${ex.category}` },
      create: { id: `seed_${ex.category}`, ...ex, language: 'he' },
      update: {},
    });
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

  console.log('🌱 Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
