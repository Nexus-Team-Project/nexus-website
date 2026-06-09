/**
 * Registry of wallet onboarding-profile fields that are mirrored into tenant
 * contact columns. Single source of truth for: which fields mirror, their
 * column type, bilingual labels, allowed option tokens, and how a stored token
 * localizes for display. The option tokens mirror the wallet onboarding slides
 * (PurposeSlide, LifeStageSlide, GenderSlide) verbatim so stored values match.
 *
 * Spec: docs/superpowers/specs/2026-06-08-wallet-answers-to-contacts-design.md
 */

/** Contact-column type a mirror field maps to. */
export type MirrorColumnType = 'multi_label' | 'single_label' | 'date' | 'free_text';

/** One allowed option with both language labels. */
export interface MirrorOption {
  value: string;
  labelEn: string;
  labelHe: string;
}

/** A mirrorable profile field definition. */
export interface MirrorFieldDef {
  /** Stable per-tenant column key (snake_case). */
  sourceFieldKey: 'purpose' | 'life_stage' | 'gender' | 'birthday' | 'motivation' | 'marketing';
  /** Key on NexusIdentity.profile (camelCase). Absent for non-profile sources
   *  like `marketing`, which is sourced from NexusIdentity.marketingConsent. */
  profileKey?: 'purpose' | 'lifeStage' | 'gender' | 'birthday' | 'motivation';
  columnType: MirrorColumnType;
  labelEn: string;
  labelHe: string;
  /** Present for single_label / multi_label. */
  options?: MirrorOption[];
}

const PURPOSE_OPTIONS: MirrorOption[] = [
  { value: 'save-money',         labelEn: 'Save money',         labelHe: 'לחסוך כסף' },
  { value: 'discover',           labelEn: 'Nearby deals',       labelHe: 'מבצעים בקרבתי' },
  { value: 'gift-cards',         labelEn: 'Gift cards',         labelHe: 'כרטיסי מתנה' },
  { value: 'compare-deals',      labelEn: 'Compare deals',      labelHe: 'להשוות מבצעים' },
  { value: 'org-benefits',       labelEn: 'Org benefits',       labelHe: 'הטבות ארגוניות' },
  { value: 'member-prices',      labelEn: 'Member prices',      labelHe: 'מחירי חברים' },
  { value: 'exclusive-offers',   labelEn: 'Exclusive offers',   labelHe: 'הצעות בלעדיות' },
  { value: 'send-gifts',         labelEn: 'Send gifts',         labelHe: 'שליחת מתנות' },
  { value: 'birthday-surprises', labelEn: 'Birthday surprises', labelHe: 'הפתעות יום הולדת' },
  { value: 'exploring',          labelEn: 'Just exploring',     labelHe: 'סתם מסתכל' },
];

const LIFE_STAGE_OPTIONS: MirrorOption[] = [
  { value: 'just-me',      labelEn: 'Just me',         labelHe: 'אני' },
  { value: 'relationship', labelEn: 'Me & my partner', labelHe: 'אני והבן/בת זוג שלי' },
  { value: 'kids',         labelEn: 'I have kids',     labelHe: 'יש לי ילדים' },
];

const GENDER_OPTIONS: MirrorOption[] = [
  { value: 'male',              labelEn: 'Masculine',     labelHe: 'בלשון זכר' },
  { value: 'female',            labelEn: 'Feminine',      labelHe: 'בלשון נקבה' },
  { value: 'prefer_not_to_say', labelEn: 'No preference', labelHe: 'לא משנה לי' },
];

/** Marketing-consent column tokens (sourced from NexusIdentity.marketingConsent). */
const MARKETING_OPTIONS: MirrorOption[] = [
  { value: 'yes', labelEn: 'Yes', labelHe: 'כן' },
  { value: 'no',  labelEn: 'No',  labelHe: 'לא' },
];

const DEFS: MirrorFieldDef[] = [
  { sourceFieldKey: 'purpose',    profileKey: 'purpose',    columnType: 'multi_label',  labelEn: 'Interests',  labelHe: 'תחומי עניין', options: PURPOSE_OPTIONS },
  { sourceFieldKey: 'life_stage', profileKey: 'lifeStage',  columnType: 'single_label', labelEn: 'Life stage', labelHe: 'מצב משפחתי', options: LIFE_STAGE_OPTIONS },
  { sourceFieldKey: 'gender',     profileKey: 'gender',     columnType: 'single_label', labelEn: 'Gender',     labelHe: 'מגדר',        options: GENDER_OPTIONS },
  { sourceFieldKey: 'birthday',   profileKey: 'birthday',   columnType: 'date',         labelEn: 'Birthday',   labelHe: 'יום הולדת' },
  { sourceFieldKey: 'motivation', profileKey: 'motivation', columnType: 'free_text',    labelEn: 'Motivation', labelHe: 'מוטיבציה' },
  { sourceFieldKey: 'marketing',  columnType: 'single_label', labelEn: 'Marketing consent', labelHe: 'הסכמה לדיוור', options: MARKETING_OPTIONS },
];

/** Returns all mirror field definitions. */
export function getMirrorFieldDefs(): MirrorFieldDef[] {
  return DEFS;
}

/**
 * Look up one definition by its stable source key.
 * Returns undefined if the key is not recognised.
 */
export function getMirrorFieldDef(sourceFieldKey: string): MirrorFieldDef | undefined {
  return DEFS.find((d) => d.sourceFieldKey === sourceFieldKey);
}

/**
 * Maps the legacy wallet slide id 'prefer-not' to the canonical backend gender
 * token 'prefer_not_to_say'. All other values are returned unchanged.
 *
 * @param raw - Raw gender string from the wallet onboarding slide.
 * @returns Canonical gender token.
 */
export function normalizeGenderToken(raw: string): string {
  return raw === 'prefer-not' ? 'prefer_not_to_say' : raw;
}

/**
 * Localize a stored token for display.
 * - single_label / multi_label: resolves option labels by value; falls back to the raw string for unknown tokens.
 * - date / free_text: passes the value through unchanged as a string.
 *
 * @param field - The MirrorFieldDef that owns this token.
 * @param token - Stored token value (string, string[], or Date-like for dates).
 * @param lang  - 'en' or 'he'.
 * @returns Human-readable string in the requested language.
 */
export function localizeAnswer(field: MirrorFieldDef, token: unknown, lang: 'en' | 'he'): string {
  const labelOf = (value: string): string => {
    const opt = field.options?.find((o) => o.value === value);
    if (!opt) return value;
    return lang === 'he' ? opt.labelHe : opt.labelEn;
  };

  if (field.columnType === 'multi_label' && Array.isArray(token)) {
    return token.map((v) => labelOf(String(v))).join(', ');
  }
  if (field.columnType === 'single_label' && typeof token === 'string') {
    return labelOf(token);
  }
  if (token == null) return '';
  return String(token);
}

/** Loose shape of the NexusIdentity.profile sub-doc this reads. */
export interface WalletProfileLike {
  purpose?: string[];
  lifeStage?: string;
  gender?: string;
  birthday?: Date | string;
  motivation?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Build a display name from a profile's first/last name.
 * @param profile partial wallet profile.
 * @returns trimmed "first last" (or the present part), or null when both empty.
 */
export function profileFullName(profile: { firstName?: string; lastName?: string }): string | null {
  const full = [profile.firstName, profile.lastName]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return full.length > 0 ? full : null;
}

/**
 * Map a profile sub-doc to a `{ sourceFieldKey: token }` object.
 * - Skips absent / empty fields so downstream upserts do not overwrite with nulls.
 * - Normalizes gender token (prefer-not -> prefer_not_to_say).
 * - Converts birthday to YYYY-MM-DD string.
 * - Trims whitespace from motivation; skips if blank.
 *
 * @param profile - Partial NexusIdentity.profile sub-doc.
 * @returns Record keyed by sourceFieldKey with ready-to-store token values.
 */
/**
 * Map a marketing-consent `granted` flag to its mirror-column token.
 * @param granted true = opted in, false = declined, undefined = never set.
 * @returns 'yes' / 'no', or undefined when consent was never recorded (so the
 *   column is left untouched rather than written as a blank).
 */
export function marketingConsentToken(granted: boolean | undefined): 'yes' | 'no' | undefined {
  if (granted === undefined || granted === null) return undefined;
  return granted ? 'yes' : 'no';
}

export function profileToMirrorTokens(profile: WalletProfileLike): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (Array.isArray(profile.purpose) && profile.purpose.length > 0) {
    out.purpose = profile.purpose;
  }
  if (profile.lifeStage) {
    out.life_stage = profile.lifeStage;
  }
  if (profile.gender) {
    out.gender = normalizeGenderToken(profile.gender);
  }
  if (profile.birthday) {
    const d = profile.birthday instanceof Date ? profile.birthday : new Date(profile.birthday);
    if (!Number.isNaN(d.getTime())) {
      out.birthday = d.toISOString().slice(0, 10);
    }
  }
  if (typeof profile.motivation === 'string' && profile.motivation.trim() !== '') {
    out.motivation = profile.motivation.trim();
  }

  return out;
}
