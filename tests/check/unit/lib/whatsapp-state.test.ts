import { describe, it, expect } from 'vitest';
import { parseLanguageChoice, isOnboarded, LANGUAGE_PROMPT } from '@/lib/modules/check/whatsapp/state';

describe('parseLanguageChoice', () => {
  it('accepts a number (1-8)', () => {
    expect(parseLanguageChoice('1')).toBe('hi');
    expect(parseLanguageChoice('8')).toBe('en');
    expect(parseLanguageChoice('2')).toBe('ta');
  });
  it('accepts a raw code, an interactive id, and a name', () => {
    expect(parseLanguageChoice('ta')).toBe('ta');
    expect(parseLanguageChoice('lang:ml')).toBe('ml');
    expect(parseLanguageChoice('Tamil')).toBe('ta');
    expect(parseLanguageChoice('বাংলা')).toBe('bn');
  });
  it('returns null for an invalid choice', () => {
    expect(parseLanguageChoice('9')).toBeNull();
    expect(parseLanguageChoice('klingon')).toBeNull();
    expect(parseLanguageChoice('')).toBeNull();
  });
});

describe('isOnboarded', () => {
  it('reads the onboarded flag from state', () => {
    expect(isOnboarded({ onboarded: true })).toBe(true);
    expect(isOnboarded({})).toBe(false);
    expect(isOnboarded(null)).toBe(false);
  });
});

describe('LANGUAGE_PROMPT', () => {
  it('lists all 8 languages by native name', () => {
    expect(LANGUAGE_PROMPT).toContain('हिन्दी');
    expect(LANGUAGE_PROMPT).toContain('മലയാളം');
    expect(LANGUAGE_PROMPT).toContain('1–8');
  });
});
