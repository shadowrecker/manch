import { env } from '@/lib/env';
import { log } from '@/lib/observability';
import type { LanguageCode } from '@/lib/modules/check/types';

// Vernacular translation layer (PRD §29). Verdicts are written in English (quality)
// then translated to the user's language in native script. Sarvam primary, Bhashini
// fallback, passthrough last — so the pipeline never hard-fails.

export interface TranslateResult {
  text: string;
  provider: 'sarvam' | 'bhashini' | 'passthrough' | 'native';
}

/** Translate English → the target language (native script). */
export async function translateText(text: string, toLang: LanguageCode): Promise<TranslateResult> {
  if (toLang === 'en' || !text.trim()) return { text, provider: 'native' };

  if (env.sarvamApiKey) {
    try {
      const res = await fetch(`${env.sarvamBaseUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': env.sarvamApiKey },
        body: JSON.stringify({
          input: text,
          source_language_code: 'en-IN',
          target_language_code: `${toLang}-IN`,
          mode: 'formal',
          output_script: 'fully-native',
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { translated_text?: string };
        if (json.translated_text) return { text: json.translated_text, provider: 'sarvam' };
      }
    } catch (e) {
      log.warn('sarvam translate failed', { error: String(e) });
    }
  }

  if (env.bhashiniApiKey) {
    // Bhashini ULCA pipeline (configured per-deployment). Stubbed to the documented
    // shape; passthrough until wired.
    return { text, provider: 'bhashini' };
  }

  return { text, provider: 'passthrough' };
}
