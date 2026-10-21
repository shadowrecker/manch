import { translateText } from '@/lib/modules/check/ai/vernacular';
import { verifyTranslationFidelity } from '@/lib/modules/check/ai/prompts/translate-qa';
import { isInNativeScript } from '@/lib/modules/check/languages';
import { log } from '@/lib/observability';
import type { LanguageCode, Verdict } from '@/lib/modules/check/types';

// Localize an English verdict into the user's language (PRD §7.2). This is the
// `localize` injected into the check pipeline (Section C seam). The user-facing
// explanation is translated to native script; a fidelity QA pass guards against a
// polarity flip — if it fails, we keep the English explanation (the SAFE default).

export async function translateVerdict(verdict: Verdict, language: LanguageCode): Promise<Verdict> {
  if (language === 'en') return { ...verdict, language: 'en' };

  const { text: translated, provider } = await translateText(verdict.explanation, language);

  // Passthrough (no provider configured) → nothing was translated; keep English.
  if (provider === 'passthrough' || !translated || translated === verdict.explanation) {
    return { ...verdict, language, explanation: verdict.explanation };
  }

  // Native-script + fidelity guard.
  const inScript = isInNativeScript(translated, language);
  const faithful = await verifyTranslationFidelity(verdict.explanation, translated, language, verdict.label);
  if (!inScript || !faithful) {
    log.warn('verdict translation rejected — keeping English', { language, inScript, faithful });
    return { ...verdict, language, explanation: verdict.explanation };
  }

  return { ...verdict, language, explanation: translated };
}
