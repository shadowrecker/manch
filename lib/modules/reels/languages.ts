import type { LanguageCode } from '@/lib/modules/reels/types';

// Manch Reels: the 8 launch languages (PRD §13/§32; Gujarati chosen as the 8th per §20-Q1).
// Odia + others arrive in the Week-12 expansion to 12.

export interface LanguageDef {
  code: LanguageCode;
  name: string; // English name
  nativeName: string; // endonym, in native script
  script: string;
  notoFont: string; // Google Noto family used for native-script rendering
  sample: string; // a native-script greeting (UI hint + test fixture)
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', notoFont: 'Noto Sans Devanagari', sample: 'नमस्ते' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', script: 'Tamil', notoFont: 'Noto Sans Tamil', sample: 'வணக்கம்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', script: 'Telugu', notoFont: 'Noto Sans Telugu', sample: 'నమస్తే' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', script: 'Devanagari', notoFont: 'Noto Sans Devanagari', sample: 'नमस्कार' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', script: 'Bengali', notoFont: 'Noto Sans Bengali', sample: 'নমস্কার' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', script: 'Kannada', notoFont: 'Noto Sans Kannada', sample: 'ನಮಸ್ಕಾರ' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', script: 'Gujarati', notoFont: 'Noto Sans Gujarati', sample: 'નમસ્તે' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', script: 'Gurmukhi', notoFont: 'Noto Sans Gurmukhi', sample: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ' },
];

export const LANGUAGE_CODES: LanguageCode[] = LANGUAGES.map((l) => l.code);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
export function languageByCode(code: string): LanguageDef | undefined {
  return BY_CODE.get(code as LanguageCode);
}
export function isLanguageCode(code: string): code is LanguageCode {
  return BY_CODE.has(code as LanguageCode);
}

// Unicode block per language — used to PROVE output is in native script, not
// romanised transliteration (the explicit B-03 requirement + §16 test gate).
export const SCRIPT_RANGES: Record<LanguageCode, RegExp> = {
  hi: /[ऀ-ॿ]/,
  mr: /[ऀ-ॿ]/,
  ta: /[஀-௿]/,
  te: /[ఀ-౿]/,
  bn: /[ঀ-৿]/,
  kn: /[ಀ-೿]/,
  gu: /[઀-૿]/,
  pa: /[਀-੿]/,
};

/** True if `text` contains characters in `code`'s native Unicode block. */
export function isInNativeScript(text: string, code: LanguageCode): boolean {
  const re = SCRIPT_RANGES[code];
  return !!re && re.test(text);
}

/** The Google Fonts family list for the language's Noto webfont (for @import / link). */
export function notoFontFor(code: LanguageCode): string {
  return languageByCode(code)?.notoFont ?? 'Noto Sans';
}
