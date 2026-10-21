import { describe, it, expect } from 'vitest';
import { generateThreeStyleScript } from '@/lib/modules/reels/ai/prompts/script';
import { isInNativeScript, LANGUAGE_CODES } from '@/lib/modules/reels/languages';

// Per-language AI golden gate (PRD §16). Runs ONLY with ANTHROPIC_API_KEY; skips
// cleanly in CI. The decisive assertion: output must be in NATIVE SCRIPT (not
// romanised) for every language — the product's core promise.
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_KEY)('script generation — live, per-language native-script gate', () => {
  for (const code of LANGUAGE_CODES) {
    it(
      `${code}: all 3 styles return hook/body/cta in native script`,
      async () => {
        const out = await generateThreeStyleScript({
          languageCode: code,
          platform: 'instagram',
          ideaText: 'My morning routine as a college student',
        });
        for (const style of ['educational', 'entertainment', 'emotional'] as const) {
          expect(out[style].hook.length).toBeGreaterThan(3);
          expect(out[style].cta.length).toBeGreaterThan(2);
          expect(isInNativeScript(`${out[style].hook} ${out[style].body}`, code)).toBe(true);
        }
      },
      60_000,
    );
  }
});

describe('ai-eval harness', () => {
  it('is configured', () => {
    expect(typeof generateThreeStyleScript).toBe('function');
  });
});
