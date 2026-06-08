/**
 * Unit tests for the contact custom-column helpers: per-type value validation,
 * the write-plan key safety (no injection via arbitrary keys), and filter-clause
 * building (paths only ever target known cf_<id> fields).
 */
import { describe, it, expect } from 'vitest';
import {
  validateCustomValue,
  planCustomWrites,
  buildCustomFilterClauses,
} from '../../src/services/contact-custom-fields.helper';
import type { TenantContactFieldDocument } from '../../src/models/domain';

function def(partial: Partial<TenantContactFieldDocument> & { fieldId: string; type: TenantContactFieldDocument['type'] }): TenantContactFieldDocument {
  return {
    tenantId: 't1',
    name: partial.name ?? 'Col',
    order: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  };
}

describe('validateCustomValue', () => {
  it('free_text trims, strips control chars, and clears on empty', () => {
    const d = def({ fieldId: 'cf_aaaaaaaa', type: 'free_text' });
    expect(validateCustomValue(d, '  hithere  ')).toEqual({ state: 'set', value: 'hithere' });
    expect(validateCustomValue(d, '   ')).toEqual({ state: 'clear' });
    expect(validateCustomValue(d, 5)).toEqual({ state: 'invalid' });
  });

  it('number coerces valid, rejects non-numeric', () => {
    const d = def({ fieldId: 'cf_bbbbbbbb', type: 'number' });
    expect(validateCustomValue(d, '12.5')).toEqual({ state: 'set', value: 12.5 });
    expect(validateCustomValue(d, 'abc')).toEqual({ state: 'invalid' });
    expect(validateCustomValue(d, '')).toEqual({ state: 'clear' });
  });

  it('date stores ISO date-only, rejects garbage', () => {
    const d = def({ fieldId: 'cf_cccccccc', type: 'date' });
    expect(validateCustomValue(d, '2026-06-04')).toEqual({ state: 'set', value: '2026-06-04' });
    expect(validateCustomValue(d, 'not-a-date')).toEqual({ state: 'invalid' });
  });

  it('single_label only accepts a defined option', () => {
    const d = def({ fieldId: 'cf_dddddddd', type: 'single_label', options: ['vip', 'lead'] });
    expect(validateCustomValue(d, 'vip')).toEqual({ state: 'set', value: 'vip' });
    expect(validateCustomValue(d, 'other')).toEqual({ state: 'invalid' });
  });

  it('multi_label accepts arrays and comma strings, subset of options only', () => {
    const d = def({ fieldId: 'cf_eeeeeeee', type: 'multi_label', options: ['a', 'b', 'c'] });
    expect(validateCustomValue(d, ['a', 'b', 'a'])).toEqual({ state: 'set', value: ['a', 'b'] });
    expect(validateCustomValue(d, 'a,c')).toEqual({ state: 'set', value: ['a', 'c'] });
    expect(validateCustomValue(d, ['a', 'z'])).toEqual({ state: 'invalid' });
  });
});

describe('planCustomWrites key safety', () => {
  const defs = [def({ fieldId: 'cf_aaaaaaaa', type: 'free_text', name: 'Notes' })];

  it('drops unknown and non-cf keys (no operator injection)', () => {
    const plan = planCustomWrites(defs, {
      cf_aaaaaaaa: 'ok',
      $where: 'evil',
      'a.b': 'dotted',
      cf_unknownx: 'no-def',
    });
    expect(plan.set).toEqual({ 'customFields.cf_aaaaaaaa': 'ok' });
    expect(plan.clearKeys).toEqual([]);
  });

  it('reports invalid values by column name', () => {
    const numDefs = [def({ fieldId: 'cf_bbbbbbbb', type: 'number', name: 'Age' })];
    const plan = planCustomWrites(numDefs, { cf_bbbbbbbb: 'abc' });
    expect(plan.invalid).toEqual(['Age']);
    expect(plan.set).toEqual({});
  });
});

describe('buildCustomFilterClauses', () => {
  const defs = [
    def({ fieldId: 'cf_aaaaaaaa', type: 'free_text' }),
    def({ fieldId: 'cf_bbbbbbbb', type: 'number' }),
    def({ fieldId: 'cf_dddddddd', type: 'single_label', options: ['vip', 'lead'] }),
  ];

  it('builds an escaped regex for contains', () => {
    const [clause] = buildCustomFilterClauses(defs, [{ fieldId: 'cf_aaaaaaaa', op: 'contains', value: 'a.b' }]);
    expect(clause).toEqual({ 'customFields.cf_aaaaaaaa': { $regex: 'a\\.b', $options: 'i' } });
  });

  it('builds a numeric range', () => {
    const [clause] = buildCustomFilterClauses(defs, [{ fieldId: 'cf_bbbbbbbb', op: 'range', value: { min: 1, max: 9 } }]);
    expect(clause).toEqual({ 'customFields.cf_bbbbbbbb': { $gte: 1, $lte: 9 } });
  });

  it('filters $in values to defined options', () => {
    const [clause] = buildCustomFilterClauses(defs, [{ fieldId: 'cf_dddddddd', op: 'in', value: ['vip', 'hacker'] }]);
    expect(clause).toEqual({ 'customFields.cf_dddddddd': { $in: ['vip'] } });
  });

  it('skips unknown fieldIds and non-cf ids (no path injection)', () => {
    const clauses = buildCustomFilterClauses(defs, [
      { fieldId: 'cf_unknownx', op: 'contains', value: 'x' },
      { fieldId: '$where', op: 'contains', value: 'x' },
    ]);
    expect(clauses).toEqual([]);
  });
});

describe('planCustomWrites wallet_profile lock', () => {
  it('ignores keys whose field is origin wallet_profile', () => {
    const defs = [
      def({ fieldId: 'cf_aaaaaaaa', type: 'free_text', name: 'Notes' }),
      def({ fieldId: 'cf_bbbbbbbb', type: 'single_label', name: 'Gender',
        options: ['male', 'female'], origin: 'wallet_profile', sourceFieldKey: 'gender' }),
    ];
    const plan = planCustomWrites(defs, { cf_aaaaaaaa: 'hi', cf_bbbbbbbb: 'female' });
    expect(plan.set).toEqual({ 'customFields.cf_aaaaaaaa': 'hi' });
    expect(plan.set['customFields.cf_bbbbbbbb']).toBeUndefined();
  });
});
