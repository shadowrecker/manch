import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  cached: (t: string) => ({ type: 'text', text: t, cache_control: { type: 'ephemeral' } }),
  runToolCall: vi.fn(),
}));

import { verifyTranslationFidelity } from '@/lib/modules/check/ai/prompts/translate-qa';
import { runToolCall } from '@/lib/ai/claude';

const mRun = vi.mocked(runToolCall);

beforeEach(() => mRun.mockReset());

describe('verifyTranslationFidelity', () => {
  it('passes when the translation is faithful and polarity preserved', async () => {
    mRun.mockResolvedValue({ faithful: true, polarity_preserved: true } as never);
    expect(await verifyTranslationFidelity('It is false', 'यह गलत है', 'hi', 'false')).toBe(true);
  });

  it('FAILS when polarity is not preserved (false → true is dangerous)', async () => {
    mRun.mockResolvedValue({ faithful: true, polarity_preserved: false } as never);
    expect(await verifyTranslationFidelity('It is false', 'यह सही है', 'hi', 'false')).toBe(false);
  });

  it('trusts the professional translation if QA itself is unavailable / malformed', async () => {
    // A null/garbage tool result throws inside the try → caught → trust the translation.
    mRun.mockResolvedValue(null as never);
    expect(await verifyTranslationFidelity('It is false', 'यह गलत है', 'hi', 'false')).toBe(true);
  });
});
