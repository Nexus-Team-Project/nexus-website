/**
 * Manual name overrides for the cashback CSV import: NORMALIZED CSV row
 * name (via normalizePartnerName) -> EXACT Partner.title in the DB.
 * Only rows the automatic title/searchTerms matching cannot resolve belong
 * here; grown from the script's unmatched report (dry-run 2026-07-23).
 * Rows deliberately NOT mapped (no DB partner / needs user decision):
 * תיקי קל גב, תיקי TRAVELITE, טיפול נפשי לחרדות וטראומות, דוד רקט,
 * אמישראגז חשמל, מערכת מולטימדיה לרכב G sound, טכנו גן,
 * כלל ביטוח x3 (one DB partner, three different percentages - conflict),
 * GARMIN Forerunner® 570 (product-specific row; the brand row "garmin" 14%
 * is the partner-level value).
 */
export const CASHBACK_NAME_OVERRIDES: Record<string, string> = {
  'golf&co': 'Golf & Co',
  'golf&kids': 'Golf Kids',
  'sabon של פעם': 'Sabon',
  'billa bong': 'Billabong',
  'flying tyger': 'Flying Tiger',
  'hoodies (הודיס)': 'Hoodies',
  'carolina lemke (קרולינה למקה)': 'Carolina Lamke',
  'urbanika (אורבניקה)': 'Urbanica',
  'yves rocher (איב רושה)': 'Yves Rocher',
  'topten (טופ-טן)': 'Top Ten',
  'kiko milano (קיקו מילאנו)': 'Kiko Milano',
  'hugs מוצרי תינוקות מעוצבים ויחודיים': 'HUGS',
  'laborsa תיקי': 'תיקי לברוס',
  'darlain דארלן': 'Darlain',
  'mogel רואה החשבון של השכירים': 'MOGEL',
  'וולטי - ייעוץ משכנתאות אינטרנטי': 'וולטי',
  'מגדל ביטוח בריאות': 'מגדל ביטוח',
  'אקזיט וואלי פלטפורמת גיוסי הון': 'אקזיט וואלי',
  'תיקי under armour': 'Under Armour',
  'תיקי reebox': 'Reebok',
  'p4u תוספי חלבון': 'Protein 4 U',
  'home 4 sport': 'הום פור ספורט',
  'energym sport': 'ENERGYM',
  'קורסי צלילה בכפר הצוללים': 'כפר הצוללים',
  'flybox מנהרת הרוח': 'Fly Box',
  'מגנוס טלפון לוויני': 'Magnus',
  'סקיי גלמפינג בוטיק': 'סקיי גלמפינג',
  'מגוון מופעים בקומדי בר וברחבי הארץ': 'קומדי בר',
  'מנווטים קדימה גיבוש והנאה צוותית': 'מנווטים קדימה',
  'cinema city vip': 'סינמה סיטי',
  'קרפור(תו פלוס)': 'קרפור',
  'רמי לוי (התו המלא)': 'רמי לוי שיווק השקמה',
  'שופרסל(תו הזהב)': 'שופרסל',
  'ovali שואבים ורובוטים': 'Ovali',
  'צעד 4x4': 'צעד 4 על 4',
};
