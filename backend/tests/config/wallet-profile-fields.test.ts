import { describe, it, expect } from 'vitest';
import {
  getMirrorFieldDefs,
  getMirrorFieldDef,
  normalizeGenderToken,
  localizeAnswer,
  profileToMirrorTokens,
} from '../../src/config/wallet-profile-fields';

describe('wallet-profile-fields registry', () => {
  it('defines the five mirror fields with stable keys', () => {
    const keys = getMirrorFieldDefs().map((d) => d.sourceFieldKey).sort();
    expect(keys).toEqual(['birthday', 'gender', 'life_stage', 'motivation', 'purpose']);
  });

  it('localizes a single_label token per language', () => {
    const gender = getMirrorFieldDef('gender')!;
    expect(localizeAnswer(gender, 'female', 'en')).toBe('Feminine');
    expect(localizeAnswer(gender, 'female', 'he')).toBe('בלשון נקבה');
  });

  it('localizes a multi_label token array, joined', () => {
    const purpose = getMirrorFieldDef('purpose')!;
    expect(localizeAnswer(purpose, ['save-money', 'gift-cards'], 'en')).toBe('Save money, Gift cards');
  });

  it('renders date and free_text tokens as-is', () => {
    expect(localizeAnswer(getMirrorFieldDef('birthday')!, '1990-05-01', 'en')).toBe('1990-05-01');
    expect(localizeAnswer(getMirrorFieldDef('motivation')!, 'save on groceries', 'he')).toBe('save on groceries');
  });

  it('falls back to the raw token when not a known option', () => {
    expect(localizeAnswer(getMirrorFieldDef('gender')!, 'unknown_x', 'en')).toBe('unknown_x');
  });

  it('normalizes the legacy prefer-not gender id', () => {
    expect(normalizeGenderToken('prefer-not')).toBe('prefer_not_to_say');
    expect(normalizeGenderToken('female')).toBe('female');
  });

  it('maps a profile sub-doc to mirror tokens, skipping empties and normalizing', () => {
    const tokens = profileToMirrorTokens({
      purpose: ['save-money'],
      lifeStage: 'kids',
      gender: 'prefer-not',
      birthday: new Date('1990-05-01T00:00:00.000Z'),
      motivation: '  hi  ',
    });
    expect(tokens).toEqual({
      purpose: ['save-money'],
      life_stage: 'kids',
      gender: 'prefer_not_to_say',
      birthday: '1990-05-01',
      motivation: 'hi',
    });
  });

  it('omits keys for absent profile fields', () => {
    expect(profileToMirrorTokens({ lifeStage: 'just-me' })).toEqual({ life_stage: 'just-me' });
  });
});
