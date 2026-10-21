import type { LanguageCode } from '@/lib/modules/check/types';

// Manch Check's 8 MVP languages (PRD §26). Bhasha's catalog adapted: +Malayalam,
// +English, -Gujarati, -Punjabi. The 4 P0 verdict languages (T-03) are Hindi,
// Tamil, Telugu, Bengali. "Fully supported" (human-QA'd) ramps 6 → 10 → 15.

export interface LanguageDef {
  code: LanguageCode;
  name: string; // English name
  nativeName: string; // endonym, in native script
  script: string;
  notoFont: string; // Google Noto family for native-script rendering
  sample: string; // a native-script greeting (UI hint + test fixture)
  freeTier: boolean; // free tier supports English + Hindi only (PRD §27)
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', notoFont: 'Noto Sans Devanagari', sample: 'नमस्ते', freeTier: true },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', script: 'Tamil', notoFont: 'Noto Sans Tamil', sample: 'வணக்கம்', freeTier: false },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', script: 'Telugu', notoFont: 'Noto Sans Telugu', sample: 'నమస్తే', freeTier: false },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', script: 'Bengali', notoFont: 'Noto Sans Bengali', sample: 'নমস্কার', freeTier: false },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', script: 'Devanagari', notoFont: 'Noto Sans Devanagari', sample: 'नमस्कार', freeTier: false },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', script: 'Kannada', notoFont: 'Noto Sans Kannada', sample: 'ನಮಸ್ಕಾರ', freeTier: false },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', script: 'Malayalam', notoFont: 'Noto Sans Malayalam', sample: 'നമസ്കാരം', freeTier: false },
  { code: 'en', name: 'English', nativeName: 'English', script: 'Latin', notoFont: 'Inter', sample: 'Hello', freeTier: true },
];

export const LANGUAGE_CODES: LanguageCode[] = LANGUAGES.map((l) => l.code);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
export function languageByCode(code: string): LanguageDef | undefined {
  return BY_CODE.get(code as LanguageCode);
}
export function isLanguageCode(code: string): code is LanguageCode {
  return BY_CODE.has(code as LanguageCode);
}

// Unicode block per language — proves a translated verdict is in NATIVE SCRIPT,
// not romanised (the §16 test gate, reused from Bhasha). English has no block.
export const SCRIPT_RANGES: Partial<Record<LanguageCode, RegExp>> = {
  hi: /[ऀ-ॿ]/,
  mr: /[ऀ-ॿ]/,
  ta: /[஀-௿]/,
  te: /[ఀ-౿]/,
  bn: /[ঀ-৿]/,
  kn: /[ಀ-೿]/,
  ml: /[ഀ-ൿ]/,
};

/** True if `text` contains characters in `code`'s native Unicode block. */
export function isInNativeScript(text: string, code: LanguageCode): boolean {
  if (code === 'en') return /[A-Za-z]/.test(text);
  const re = SCRIPT_RANGES[code];
  return !!re && re.test(text);
}

/** Detect a language from native script. Returns null for romanised/Latin text. */
const DETECT_ORDER: LanguageCode[] = ['ta', 'te', 'bn', 'kn', 'ml', 'hi'];
export function detectScriptLanguage(text: string): LanguageCode | null {
  for (const code of DETECT_ORDER) {
    const re = SCRIPT_RANGES[code];
    if (re && re.test(text)) return code;
  }
  return null;
}

/** The Google Noto family for the language's webfont. */
export function notoFontFor(code: LanguageCode): string {
  return languageByCode(code)?.notoFont ?? 'Noto Sans';
}
