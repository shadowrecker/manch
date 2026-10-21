import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/modules/check/ai/vernacular', () => ({ translateText: vi.fn() }));
vi.mock('@/lib/modules/check/ai/prompts/translate-qa', () => ({ verifyTranslationFidelity: vi.fn() }));

import { translateVerdict } from '@/lib/modules/check/verdict/translate';
import { translateText } from '@/lib/modules/check/ai/vernacular';
import { verifyTranslationFidelity } from '@/lib/modules/check/ai/prompts/translate-qa';
import type { Verdict } from '@/lib/modules/check/types';

const mTranslate = vi.mocked(translateText);
const mVerify = vi.mocked(verifyTranslationFidelity);

const EN: Verdict = { trustScore: 2, label: 'false', explanation: 'This claim is false.', claims: [], sources: [], language: 'en' };

beforeEach(() => {
  mTranslate.mockReset();
  mVerify.mockReset();
});

describe('translateVerdict', () => {
  it('passes English through untouched', async () => {
    const out = await translateVerdict(EN, 'en');
    expect(out.explanation).toBe('This claim is false.');
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it('uses the native-script translation when it is faithful', async () => {
    mTranslate.mockResolvedValue({ text: 'यह दावा गलत है।', provider: 'sarvam' });
    mVerify.mockResolvedValue(true);
    const out = await translateVerdict(EN, 'hi');
    expect(out.language).toBe('hi');
    expect(out.explanation).toBe('यह दावा गलत है।');
  });

  it('falls back to English when the translation is NOT faithful (no flipped verdict)', async () => {
    mTranslate.mockResolvedValue({ text: 'यह दावा सही है।', provider: 'sarvam' }); // (a flip)
    mVerify.mockResolvedValue(false);
    const out = await translateVerdict(EN, 'hi');
    expect(out.language).toBe('hi');
    expect(out.explanation).toBe('This claim is false.'); // English kept — safe
  });

  it('falls back to English when the provider only passes through (no key)', async () => {
    mTranslate.mockResolvedValue({ text: 'This claim is false.', provider: 'passthrough' });
    const out = await translateVerdict(EN, 'ta');
    expect(out.explanation).toBe('This claim is false.');
    expect(mVerify).not.toHaveBeenCalled();
  });

  it('falls back to English when the translation is not in native script', async () => {
    mTranslate.mockResolvedValue({ text: 'yah daava galat hai', provider: 'sarvam' }); // romanised
    mVerify.mockResolvedValue(true);
    const out = await translateVerdict(EN, 'hi');
    expect(out.explanation).toBe('This claim is false.');
  });
});
