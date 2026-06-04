/**
 * Shared validation + query-building helpers for tenant contact custom columns.
 *
 * SECURITY: custom values are always keyed by the server-generated `fieldId`
 * ("cf_<id>"), validated here against FIELD_ID_RE and against the tenant's own
 * field definitions before any value reaches a Mongo `customFields.<fieldId>`
 * path. The user's free-text column name is NEVER used as a key, so no `$`/`.`
 * operator-injection is possible through this surface.
 */
import type { TenantContactFieldDocument } from '../models/domain';

/** Server-generated custom-field id shape. */
export const FIELD_ID_RE = /^cf_[a-z0-9]{8,}$/;

// Caps (kept conservative; tune here in one place).
export const MAX_CONTACT_FIELDS = 25;
export const MAX_FIELD_NAME = 50;
export const MAX_TEXT_VALUE = 500;
export const MAX_OPTION_LEN = 40;
export const MAX_OPTIONS = 30;
export const MAX_MULTI_SELECT = 30;
const MAX_NUMBER_ABS = 1e15;

/** Matches ASCII control characters (stripped from stored free text). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/** Escapes regex metacharacters so a user value cannot inject regex syntax. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes control characters and trims; caps to MAX_TEXT_VALUE. */
function sanitizeText(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').trim().slice(0, MAX_TEXT_VALUE);
}

/** Outcome of validating one custom value against its column definition. */
export type CustomValueResult =
  | { state: 'set'; value: unknown }
  | { state: 'clear' }
  | { state: 'invalid' };

/**
 * Validate + coerce a single raw custom value against a column definition.
 * Empty input -> 'clear'; valid -> 'set' with the normalized value;
 * anything that cannot be coerced for the type -> 'invalid'.
 */
export function validateCustomValue(def: TenantContactFieldDocument, raw: unknown): CustomValueResult {
  if (raw === undefined || raw === null) return { state: 'clear' };

  switch (def.type) {
    case 'free_text':
    case 'location': {
      if (typeof raw !== 'string') return { state: 'invalid' };
      const v = sanitizeText(raw);
      return v === '' ? { state: 'clear' } : { state: 'set', value: v };
    }
    case 'number': {
      if (raw === '') return { state: 'clear' };
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n) || Math.abs(n) > MAX_NUMBER_ABS) return { state: 'invalid' };
      return { state: 'set', value: n };
    }
    case 'date': {
      if (typeof raw !== 'string' || raw.trim() === '') {
        return raw === '' ? { state: 'clear' } : { state: 'invalid' };
      }
      const parsed = new Date(raw.trim());
      if (Number.isNaN(parsed.getTime())) return { state: 'invalid' };
      // Store the date-only ISO portion so range filters compare lexicographically.
      return { state: 'set', value: parsed.toISOString().slice(0, 10) };
    }
    case 'single_label': {
      if (typeof raw !== 'string') return { state: 'invalid' };
      const v = raw.trim();
      if (v === '') return { state: 'clear' };
      return (def.options ?? []).includes(v) ? { state: 'set', value: v } : { state: 'invalid' };
    }
    case 'multi_label': {
      // Accept an array, or a comma-separated string (convenient for CSV import).
      const list = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
          ? raw.split(',')
          : null;
      if (!list) return { state: 'invalid' };
      const opts = def.options ?? [];
      const cleaned = Array.from(
        new Set(list.map((x) => String(x).trim()).filter((x) => x !== '')),
      ).slice(0, MAX_MULTI_SELECT);
      if (cleaned.length === 0) return { state: 'clear' };
      if (cleaned.some((x) => !opts.includes(x))) return { state: 'invalid' };
      return { state: 'set', value: cleaned };
    }
    default:
      return { state: 'invalid' };
  }
}

/** $set / clear-key plan for writing a payload's customFields onto a contact. */
export interface CustomWritePlan {
  /** Dot-path `$set` entries, e.g. { 'customFields.cf_abc': 'value' }. */
  set: Record<string, unknown>;
  /** fieldIds whose value should be cleared (caller decides $unset vs omit). */
  clearKeys: string[];
  /** Column display names that failed validation (for strict-mode errors). */
  invalid: string[];
}

/**
 * Turn a raw `customFields` payload object into a write plan, dropping any key
 * that is not a known fieldId for this tenant. Unknown keys are silently
 * ignored; bad values are reported in `invalid` (the caller errors in strict
 * mode, or ignores them for lenient import = "blank that cell, keep the row").
 */
export function planCustomWrites(
  defs: TenantContactFieldDocument[],
  payload: Record<string, unknown>,
): CustomWritePlan {
  const byId = new Map(defs.map((d) => [d.fieldId, d]));
  const plan: CustomWritePlan = { set: {}, clearKeys: [], invalid: [] };

  for (const [key, raw] of Object.entries(payload)) {
    if (!FIELD_ID_RE.test(key)) continue; // never trust an arbitrary key
    const def = byId.get(key);
    if (!def) continue;
    const res = validateCustomValue(def, raw);
    if (res.state === 'set') plan.set[`customFields.${key}`] = res.value;
    else if (res.state === 'clear') plan.clearKeys.push(key);
    else plan.invalid.push(def.name);
  }
  return plan;
}

/** One custom-column filter from the list query. */
export interface CustomFilter {
  fieldId: string;
  op: 'contains' | 'range' | 'in';
  value: unknown;
}

/**
 * Build Mongo clauses for custom-column filters. Each clause targets
 * `customFields.<fieldId>` only after the fieldId is matched to a real column
 * definition + FIELD_ID_RE, so no user free-text can shape the query path.
 * Malformed filters are skipped (not an error).
 */
export function buildCustomFilterClauses(
  defs: TenantContactFieldDocument[],
  filters: CustomFilter[],
): Record<string, unknown>[] {
  const byId = new Map(defs.map((d) => [d.fieldId, d]));
  const clauses: Record<string, unknown>[] = [];

  for (const f of filters) {
    if (!FIELD_ID_RE.test(f.fieldId)) continue;
    const def = byId.get(f.fieldId);
    if (!def) continue;
    const path = `customFields.${f.fieldId}`;

    if ((def.type === 'free_text' || def.type === 'location') && f.op === 'contains') {
      if (typeof f.value !== 'string' || f.value.trim() === '') continue;
      clauses.push({ [path]: { $regex: escapeRegex(f.value.trim()), $options: 'i' } });
    } else if (def.type === 'number' && f.op === 'range') {
      const r = f.value as { min?: unknown; max?: unknown };
      const range: Record<string, number> = {};
      const min = Number(r?.min);
      const max = Number(r?.max);
      if (r?.min !== undefined && r?.min !== '' && Number.isFinite(min)) range.$gte = min;
      if (r?.max !== undefined && r?.max !== '' && Number.isFinite(max)) range.$lte = max;
      if (Object.keys(range).length) clauses.push({ [path]: range });
    } else if (def.type === 'date' && f.op === 'range') {
      const r = f.value as { from?: unknown; to?: unknown };
      const range: Record<string, string> = {};
      const isDate = (s: unknown): s is string =>
        typeof s === 'string' && s.trim() !== '' && !Number.isNaN(new Date(s).getTime());
      if (isDate(r?.from)) range.$gte = new Date(r.from as string).toISOString().slice(0, 10);
      if (isDate(r?.to)) range.$lte = new Date(r.to as string).toISOString().slice(0, 10);
      if (Object.keys(range).length) clauses.push({ [path]: range });
    } else if ((def.type === 'single_label' || def.type === 'multi_label') && f.op === 'in') {
      if (!Array.isArray(f.value)) continue;
      const opts = def.options ?? [];
      const picked = f.value.map((x) => String(x)).filter((x) => opts.includes(x));
      if (picked.length) clauses.push({ [path]: { $in: picked } });
    }
  }
  return clauses;
}
