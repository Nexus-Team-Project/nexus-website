// Curated NEW partner orgs from the benefits CSV (rows 4-142), 2026-07-09.
// Only orgs NOT already present in the 71 seeded Partner rows.
// thumbnailUrl is derived as `/partners/${slug}.png` (static file in nexus-website/public/partners/).
// Spec: docs/superpowers/specs/2026-07-09-partners-csv-orgs-design.md

export interface NewPartnerSeed {
  /** Display title - the brand's natural name (matches existing card style). */
  title: string;
  /** Logo filename stem under /partners/. Lowercase kebab, stable. */
  slug: string;
  /** Hebrew category chips - reuses the existing vocabulary where possible. */
  categories: string[];
  /** Hebrew benefit text from the CSV (shown to logged-in users), null if none. */
  discount: string | null;
  /** Domain hint for logo research only - never stored in DB. */
  logoHint?: string;
}

/**
 * Pinned display orders (route sorts by `order` asc, legacy rows start at 1).
 * Supermarkets must appear first on the /partners page - negative orders put
 * them ahead of everything without renumbering the other 130+ rows.
 */
export const PINNED_ORDERS: Record<string, number> = {
  'רמי לוי שיווק השקמה': -4,
  'קרפור': -3,
  'שופרסל': -2,
  'ויקטורי': -1,
};

export const NEW_PARTNERS: NewPartnerSeed[] = [
  // ── אופנה ולבית ──────────────────────────────────────────
  { title: 'Golf',                 slug: 'golf',             categories: ['ביגוד'],                    discount: '50% הנחה או 20% כולל כפל מבצעים', logoHint: 'golf.co.il' },
  { title: 'אקיפ',                 slug: 'ekip',             categories: ['לבית'],                     discount: '25% הנחה', logoHint: 'equip.co.il' },
  { title: 'מגנוליה',              slug: 'magnolia',         categories: ['תכשיטים'],                  discount: '25% הנחה', logoHint: 'magnolia.co.il' },
  { title: 'Quiksilver',           slug: 'quiksilver',       categories: ['ביגוד'],                    discount: '20% הנחה כולל כפל מבצעים', logoHint: 'quiksilver.com' },
  { title: 'Flying Tiger',         slug: 'flying-tiger',     categories: ['לבית'],                     discount: '20% הנחה כולל כפל מבצעים', logoHint: 'flyingtiger.com' },
  { title: 'Fox',                  slug: 'fox',              categories: ['ביגוד'],                    discount: '20% הנחה כולל כפל מבצעים', logoHint: 'fox.co.il' },
  { title: 'Nike',                 slug: 'nike',             categories: ['ספורט', 'ביגוד'],           discount: '20% הנחה כולל כפל מבצעים', logoHint: 'nike.com' },
  { title: 'Terminal X',           slug: 'terminal-x',       categories: ['ביגוד'],                    discount: '20% הנחה כולל כפל מבצעים', logoHint: 'terminalx.com' },
  { title: 'GALI',                 slug: 'gali',             categories: ['ביגוד'],                    discount: '15% הנחה כולל כפל מבצעים', logoHint: 'gali.co.il' },
  { title: 'Lee Cooper',           slug: 'lee-cooper',       categories: ['ביגוד'],                    discount: '15% הנחה כולל כפל מבצעים', logoHint: 'leecooper.co.il' },
  { title: 'Nine West',            slug: 'nine-west',        categories: ['ביגוד', 'נשים'],            discount: '15% הנחה כולל כפל מבצעים', logoHint: 'ninewest.co.il' },
  { title: 'Caterpillar',          slug: 'caterpillar',      categories: ['ביגוד'],                    discount: '15% הנחה כולל כפל מבצעים', logoHint: 'catfootwear.com' },
  { title: 'Hush Puppies',         slug: 'hush-puppies',     categories: ['ביגוד'],                    discount: '15% הנחה כולל כפל מבצעים', logoHint: 'hushpuppies.co.il' },
  { title: 'Nautica',              slug: 'nautica',          categories: ['ביגוד'],                    discount: '15% הנחה כולל כפל מבצעים', logoHint: 'nautica.com' },
  { title: 'Timberland',           slug: 'timberland',       categories: ['ביגוד'],                    discount: '15% הנחה כולל כפל מבצעים', logoHint: 'timberland.com' },
  { title: 'ALDO',                 slug: 'aldo',             categories: ['ביגוד'],                    discount: '15% הנחה כולל כפל מבצעים', logoHint: 'aldoshoes.com' },
  { title: 'Step In',              slug: 'step-in',          categories: ['ביגוד'],                    discount: '15% הנחה כולל כפל מבצעים' },
  { title: 'Gant',                 slug: 'ganet',            categories: ['ביגוד'],                    discount: '10% הנחה', logoHint: 'gant.co.il' },
  { title: 'G-Star RAW',           slug: 'g-star-raw',       categories: ['ביגוד'],                    discount: '10% הנחה', logoHint: 'g-star.com' },
  { title: 'תיקי לברוס',           slug: 'lebros',           categories: ['אקססוריס'],                 discount: '10% הנחה על מאות תיקים לגבר ולאישה' },
  { title: 'בריז',                 slug: 'breeze',           categories: ['ביגוד'],                    discount: '10% הנחה' },
  { title: 'Alxndr',               slug: 'alxndr',           categories: ['לבית'],                     discount: '25% הנחה על כלל המוצרים לבית' },
  { title: 'אופטיקנה',             slug: 'opticana',         categories: ['אופטיקה'],                  discount: '5% הנחה', logoHint: 'opticana.co.il' },
  { title: 'Toys R Us',            slug: 'toys-r-us',        categories: ['ילדים'],                    discount: '5% הנחה', logoHint: 'toysrus.co.il' },
  { title: 'ריקושט',               slug: 'ricochet',         categories: ['שטח', 'ביגוד'],             discount: '20% הנחה', logoHint: 'ricochet.co.il' },
  { title: 'מגה ספורט',            slug: 'mega-sport',       categories: ['ספורט'],                    discount: '25% הנחה', logoHint: 'megasport.co.il' },
  { title: 'Adidas',               slug: 'adidas',           categories: ['ספורט', 'ביגוד'],           discount: '25% הנחה', logoHint: 'adidas.co.il' },
  { title: 'Diadora',              slug: 'diadora',          categories: ['ספורט'],                    discount: '25% הנחה', logoHint: 'diadora.com' },
  { title: 'Reebok',               slug: 'reebok',           categories: ['ספורט'],                    discount: '25% הנחה', logoHint: 'reebok.com' },
  { title: 'Under Armour',         slug: 'under-armour',     categories: ['ספורט'],                    discount: '25% הנחה', logoHint: 'underarmour.com' },
  { title: 'גוד פארם',             slug: 'good-pharm',       categories: ['פארם'],                     discount: '5% הנחה', logoHint: 'goodpharm.co.il' },
  { title: 'iDigital',             slug: 'idigital',         categories: ['אלקטרוניקה'],               discount: '25% הנחה', logoHint: 'idigital.co.il' },
  { title: 'Keter',                slug: 'keter',            categories: ['לבית'],                     discount: '5% הנחה כולל כפל מבצעים', logoHint: 'keter.com' },
  { title: 'שבילים',               slug: 'shvilim',          categories: ['טיולים', 'שטח'],            discount: '5% הנחה כולל כפל מבצעים' },
  { title: 'H&O',                  slug: 'h-and-o',          categories: ['ביגוד'],                    discount: '5% הנחה כולל כפל מבצעים', logoHint: 'ho-fashion.com' },
  { title: 'Sabon',                slug: 'sabon',            categories: ['קוסמטיקה'],                 discount: '5% הנחה כולל כפל מבצעים', logoHint: 'sabon.co.il' },
  { title: 'Columbia',             slug: 'columbia',         categories: ['ביגוד', 'שטח'],             discount: '5% הנחה כולל כפל מבצעים', logoHint: 'columbia.co.il' },
  // ── פיננסים וביטוחים ─────────────────────────────────────
  { title: 'הראל ביטוח',           slug: 'harel',            categories: ['ביטוח'],                    discount: 'הנחה על דמי הביטוח 10%', logoHint: 'harel-group.co.il' },
  { title: 'MOGEL',                slug: 'mogel',            categories: ['פיננסים'],                  discount: '20% הנחה בעמלה בתהליך החזרת מס' },
  { title: 'ארביטראז',             slug: 'arbitrage',        categories: ['פיננסים'],                  discount: 'ייעוץ פיננסי ופנסיוני, וליווי תהליך כלכלי מותאם בחליפה אישית - עד 50% הנחה' },
  { title: 'פליישור',              slug: 'playsure',         categories: ['ביטוח'],                    discount: '10% הנחה + ספורט אתגרי במתנה בחברות המובילות' },
  { title: 'וולטי',                slug: 'wolty',            categories: ['פיננסים'],                  discount: 'ייעוץ משכנתא טכנולוגי וחדשני ב-5% הנחה' },
  { title: 'מגדל ביטוח',           slug: 'migdal',           categories: ['ביטוח'],                    discount: '10% הנחה + ספורט אתגרי בחינם', logoHint: 'migdal.co.il' },
  { title: 'כלל ביטוח',            slug: 'clal',             categories: ['ביטוח'],                    discount: 'הנחות בביטוח רכב, דירה, נסיעות, חיים ובריאות', logoHint: 'clalbit.co.il' },
  { title: 'אקזיט וואלי',          slug: 'exitvalley',       categories: ['פיננסים'],                  discount: '25% הנחה לסטארטאפים', logoHint: 'exitvalley.com' },
  { title: 'פמיליביז',             slug: 'familybiz',        categories: ['פיננסים'],                  discount: '99₪ במקום 399₪', logoHint: 'familybiz.co.il' },
  // ── ספורט ובריאות ────────────────────────────────────────
  { title: 'ימית חנות גלישה',      slug: 'yamit-surf',       categories: ['ספורט'],                    discount: '20% על ציוד גלישה' },
  { title: 'קייטשופ',              slug: 'kiteshop',         categories: ['ספורט'],                    discount: '10% על מגוון מוצרי קיט' },
  { title: 'הום פור ספורט',        slug: 'home-for-sport',   categories: ['ספורט'],                    discount: '8% הנחה על ניתוח סגנון ריצה והתאמת מדרסים' },
  // ── נופש ותיירות ─────────────────────────────────────────
  { title: 'HOAM SIM',             slug: 'hoam-sim',         categories: ['טיולים', 'נופש'],           discount: '1GB מתנה או 20% הנחה' },
  { title: 'נומה נומה',            slug: 'numa-numa',        categories: ['וולנס'],                    discount: 'טיפולי דיקור סיני ומעבדת שינה בהנחה של 40%' },
  { title: 'צימר נוף הארגמן',      slug: 'nof-haargaman',    categories: ['נופש'],                     discount: '10% הנחה' },
  { title: 'סקיי גלמפינג',         slug: 'sky-glamping',     categories: ['נופש'],                     discount: '10% הנחה' },
  // ── הכשרות ולימודים ──────────────────────────────────────
  { title: 'מכללת יהונתן וולשטיין', slug: 'wolstein',        categories: ['קורסים', 'פיננסים'],        discount: '1,700 ש"ח מתנה בהרשמה לקורס' },
  // ── פנאי ─────────────────────────────────────────────────
  { title: 'סינמה סיטי',           slug: 'cinema-city',      categories: ['פנאי'],                     discount: '5% הנחה', logoHint: 'cinema-city.co.il' },
  { title: 'שקם אלקטריק',          slug: 'sheka-electric',   categories: ['אלקטרוניקה'],               discount: '5% הנחה', logoHint: 'shekem-electric.co.il' },
  // ── אוכל ─────────────────────────────────────────────────
  { title: 'Wolt',                 slug: 'wolt',             categories: ['אוכל'],                     discount: '5% הנחה', logoHint: 'wolt.com' },
  { title: 'דומינוס פיצה',         slug: 'dominos',          categories: ['אוכל'],                     discount: '12% הנחה', logoHint: 'dominos.co.il' },
  { title: "ג'פניקה",              slug: 'japanika',         categories: ['אוכל'],                     discount: '7% הנחה', logoHint: 'japanika.net' },
  { title: 'פרעצל',                slug: 'pretzel',          categories: ['אוכל'],                     discount: '7% הנחה' },
  { title: 'פיצה האט',             slug: 'pizza-hut',        categories: ['אוכל'],                     discount: '12% הנחה', logoHint: 'pizzahut.co.il' },
  { title: "בורגראנץ'",            slug: 'burgeranch',       categories: ['אוכל'],                     discount: '5% הנחה', logoHint: 'burgeranch.co.il' },
  // ── סופר ─────────────────────────────────────────────────
  { title: 'קרפור',                slug: 'carrefour',        categories: ['מזון', 'סופרמרקט'],         discount: '6% הנחה', logoHint: 'carrefour.co.il' },
  { title: 'שופרסל',               slug: 'shufersal',        categories: ['מזון', 'סופרמרקט'],         discount: '5% הנחה', logoHint: 'shufersal.co.il' },
  { title: 'ויקטורי',              slug: 'victory',          categories: ['מזון', 'סופרמרקט'],         discount: '5% הנחה', logoHint: 'victoryonline.co.il' },
];
