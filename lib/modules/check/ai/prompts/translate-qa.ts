import type Anthropic from '@anthropic-ai/sdk';
import { cached, runToolCall } from '@/lib/ai/claude';
import type { LanguageCode, VerdictLabel } from '@/lib/modules/check/types';

// Translation-fidelity QA (PRD §9). A verdict that says "false" must not become
// "true" in translation — a polarity flip is dangerous. This second pass checks the
// translation preserved the verdict's meaning + caveats before it reaches the user.

const SYSTEM = `You verify that a fact-check verdict was translated faithfully.

You are given the ENGLISH verdict, its overall label (verified/misleading/false/
unverified/manipulated), and a TRANSLATION. Confirm the translation preserves:
(1) the POLARITY — a "false"/"misleading" verdict must NOT read as true/safe, and
    a "verified" verdict must not read as false;
(2) the CAVEATS — any "we could not verify" / "be cautious" hedging is kept.
Return faithful=false if the polarity or a key caveat was lost or flipped.`;

const TOOL: Anthropic.Tool = {
  name: 'emit_fidelity',
  description: 'Report whether the translation preserved the verdict meaning.',
  input_schema: {
    type: 'object',
    properties: {
      faithful: { type: 'boolean' },
      polarity_preserved: { type: 'boolean' },
      note: { type: 'string' },
    },
    required: ['faithful', 'polarity_preserved'],
  },
};

/**
 * True if the translation is faithful. On any failure (e.g. no Claude key) we TRUST
 * the professional translation (Sarvam) rather than block — the QA is a safety net
 * for the rare polarity flip, not a hard dependency.
 */
export async function verifyTranslationFidelity(
  englishText: string,
  translatedText: string,
  language: LanguageCode,
  label: VerdictLabel,
): Promise<boolean> {
  try {
    const out = await runToolCall<{ faithful: boolean; polarity_preserved: boolean }>({
      system: [cached(SYSTEM)],
      messages: [
        {
          role: 'user',
          content: [
            `LABEL: ${label}`,
            `LANGUAGE: ${language}`,
            `ENGLISH:\n${englishText}`,
            `TRANSLATION:\n${translatedText}`,
          ].join('\n\n'),
        },
      ],
      tool: TOOL,
      maxTokens: 300,
      temperature: 0,
    });
    return out.faithful && out.polarity_preserved;
  } catch {
    return true; // trust the translation if we can't QA it
  }
}
