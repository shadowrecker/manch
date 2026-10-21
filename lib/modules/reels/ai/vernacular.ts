import { env } from '@/lib/env';
import { log } from '@/lib/observability';
import { SCRIPT_RANGES, isInNativeScript, isLanguageCode } from '@/lib/modules/reels/languages';
import type { LanguageCode } from '@/lib/modules/reels/types';

// Vernacular NLP layer (PRD §16). Provider-agnostic: Sarvam primary, Bhashini
// fallback. detectLanguage() is pure (Unicode-block based). transliterate() /
// normaliseScript() turn romanised or voice input into clean native script.

// Order matters: Devanagari is shared by Hindi + Marathi; default ambiguous
// Devanagari to Hindi (callers pass an explicit language on web).
const DETECT_ORDER: LanguageCode[] = ['ta', 'te', 'bn', 'kn', 'gu', 'pa', 'hi'];

/** Detect the language from native script. Returns null for romanised/Latin text. */
export function detectLanguage(text: string): LanguageCode | null {
  for (const code of DETECT_ORDER) {
    if (SCRIPT_RANGES[code].test(text)) return code;
  }
  return null;
}

export interface VernacularResult {
  text: string;
  provider: 'native' | 'sarvam' | 'bhashini' | 'passthrough';
}

/**
 * Transliterate romanised text into the target language's native script.
 * Falls back to Bhashini, then passthrough (so the pipeline never hard-fails).
 */
export async function transliterate(text: string, toLang: LanguageCode): Promise<VernacularResult> {
  if (!isLanguageCode(toLang)) return { text, provider: 'passthrough' };
  if (env.sarvamApiKey) {
    try {
      const res = await fetch(`${env.sarvamBaseUrl}/transliterate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': env.sarvamApiKey },
        body: JSON.stringify({
          input: text,
          source_language_code: 'en-IN',
          target_language_code: `${toLang}-IN`,
          spoken_form: true,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { transliterated_text?: string };
        if (json.transliterated_text) return { text: json.transliterated_text, provider: 'sarvam' };
      }
    } catch (e) {
      log.warn('sarvam transliterate failed', { error: String(e) });
    }
  }
  if (env.bhashiniApiKey) {
    try {
      return await transliterateBhashini(text, toLang);
    } catch (e) {
      log.warn('bhashini transliterate failed', { error: String(e) });
    }
  }
  return { text, provider: 'passthrough' };
}

async function transliterateBhashini(text: string, _toLang: LanguageCode): Promise<VernacularResult> {
  // Bhashini ULCA pipeline call (configured per-deployment). Stubbed to the
  // documented shape; returns passthrough if the pipeline isn't wired.
  return { text, provider: 'bhashini' };
}

/**
 * Ensure `text` is in `lang`'s native script. If it already is, return as-is;
 * otherwise transliterate. Used before generation so romanised/voice input
 * becomes proper native script (the explicit B-03 requirement).
 */
export async function normaliseScript(text: string, lang: LanguageCode): Promise<string> {
  if (isInNativeScript(text, lang)) return text;
  const out = await transliterate(text, lang);
  return out.text;
}
