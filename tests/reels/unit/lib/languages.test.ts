import { describe, it, expect } from 'vitest';
import {
  LANGUAGES,
  LANGUAGE_CODES,
  languageByCode,
  isLanguageCode,
  isInNativeScript,
  SCRIPT_RANGES,
} from '@/lib/modules/reels/languages';
import type { LanguageCode } from '@/lib/modules/reels/types';

describe('language catalog', () => {
  it('ships exactly the 8 launch languages incl. Gujarati (not Odia)', () => {
    expect(LANGUAGE_CODES).toEqual(['hi', 'ta', 'te', 'mr', 'bn', 'kn', 'gu', 'pa']);
    expect(LANGUAGE_CODES).toContain('gu');
    expect(LANGUAGE_CODES).not.toContain('or');
  });

  it('every language has a native name, script, and Noto font', () => {
    for (const l of LANGUAGES) {
      expect(l.nativeName.length).toBeGreaterThan(0);
      expect(l.notoFont).toMatch(/^Noto Sans/);
      expect(l.script.length).toBeGreaterThan(0);
    }
  });

  it('languageByCode + isLanguageCode', () => {
    expect(languageByCode('ta')?.name).toBe('Tamil');
    expect(languageByCode('xx')).toBeUndefined();
    expect(isLanguageCode('hi')).toBe(true);
    expect(isLanguageCode('zz')).toBe(false);
  });
});

describe('native-script validation (the B-03 / §16 gate)', () => {
  const samples: Record<LanguageCode, string> = {
    hi: 'नमस्ते दोस्तों',
    mr: 'नमस्कार मित्रांनो',
    ta: 'வணக்கம் நண்பர்களே',
    te: 'నమస్తే మిత్రులారా',
    bn: 'নমস্কার বন্ধুরা',
    kn: 'ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ',
    gu: 'નમસ્તે મિત્રો',
    pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਦੋਸਤੋ',
  };

  it('accepts each language sample as in-script', () => {
    for (const code of LANGUAGE_CODES) {
      expect(isInNativeScript(samples[code], code)).toBe(true);
    }
  });

  it('rejects romanised / English as not-in-script (the failure mode we guard)', () => {
    for (const code of LANGUAGE_CODES) {
      expect(isInNativeScript('Namaste doston, kaise ho', code)).toBe(false);
    }
  });

  it('does not confuse one script for another (Tamil text is not Telugu)', () => {
    expect(isInNativeScript(samples.ta, 'te')).toBe(false);
    expect(isInNativeScript(samples.gu, 'bn')).toBe(false);
  });

  it('has a range regex per language', () => {
    for (const code of LANGUAGE_CODES) expect(SCRIPT_RANGES[code]).toBeInstanceOf(RegExp);
  });
});
