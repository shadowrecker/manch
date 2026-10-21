import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  cached: (t: string) => ({ type: 'text', text: t, cache_control: { type: 'ephemeral' } }),
  runToolCall: vi.fn(),
}));

import { composeMediaKit } from '@/lib/modules/deals/ai/prompts/mediakit';
import { runToolCall } from '@/lib/ai/claude';

const mRun = vi.mocked(runToolCall);

const KIT = {
  headline: 'Lucknow home-cooking creator',
  about: 'About.',
  keyStatsNarrative: 'Stats narrative.',
  whyBrands: 'Why brands.',
  pricingNote: 'Pricing.',
};

interface RunParams {
  messages: { content: string }[];
  tool: { name: string };
  maxTokens?: number;
  temperature?: number;
}

// Capture the params synchronously so the assertion does not depend on
// cross-test mock.calls retention.
function captureRun() {
  let captured: RunParams | null = null;
  mRun.mockImplementation((p) => {
    captured = p as unknown as RunParams;
    return Promise.resolve(KIT) as never;
  });
  return () => captured as unknown as RunParams;
}

beforeEach(() => mRun.mockResolvedValue(KIT as never));

describe('composeMediaKit', () => {
  it('returns the structured kit from the tool call', async () => {
    const out = await composeMediaKit({
      followers: 8500,
      engagementRate: 4.2,
      niche: ['home cooking'],
      contentStyle: 'warm',
      city: 'Lucknow',
      topCategories: ['recipes'],
    });
    expect(out).toEqual(KIT);
  });

  it('passes only the provided stats into the prompt (never invents numbers)', async () => {
    const get = captureRun();
    await composeMediaKit({
      followers: 8500,
      engagementRate: 4.2,
      niche: ['home cooking'],
      contentStyle: 'warm',
      city: 'Lucknow',
      topCategories: ['recipes'],
    });
    const userMsg = get().messages[0].content;
    expect(userMsg).toContain('8500 followers');
    expect(userMsg).toContain('4.2% engagement');
    expect(userMsg).toContain('Lucknow');
    expect(userMsg).toContain('do not invent');
    expect(get().tool.name).toBe('emit_media_kit');
  });

  it('degrades gracefully when stats are missing', async () => {
    const get = captureRun();
    await composeMediaKit({
      followers: null,
      engagementRate: null,
      niche: [],
      contentStyle: null,
      city: null,
      topCategories: [],
    });
    const userMsg = get().messages[0].content;
    expect(userMsg).toContain('general');
    expect(userMsg).toContain('— followers');
  });
});
