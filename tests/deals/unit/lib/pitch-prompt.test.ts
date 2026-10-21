import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  cached: (t: string) => ({ type: 'text', text: t, cache_control: { type: 'ephemeral' } }),
  runToolCall: vi.fn(),
}));

import { composePitch } from '@/lib/modules/deals/ai/prompts/pitch';
import { runToolCall } from '@/lib/ai/claude';

const mRun = vi.mocked(runToolCall);

interface RunParams {
  system: { text: string }[];
  messages: { content: string }[];
  tool: { name: string };
}

function captureRun(result: unknown) {
  let captured: RunParams | null = null;
  mRun.mockImplementation((p) => {
    captured = p as unknown as RunParams;
    return Promise.resolve(result) as never;
  });
  return () => captured as unknown as RunParams;
}

const DRAFT = { subject: 'Collab with you', body: 'Hi team...' };

const input = {
  creator: { niche: ['home cooking'], followers: 8500, engagementRate: 4.2, city: 'Lucknow', contentStyle: 'warm' },
  brandName: 'Slurrp Farm',
  brandNiche: ['food', 'parenting'],
  brandAudience: 'parents',
  deliverables: ['reel', 'story'] as const,
  suggestedRatePaise: 1800000,
};

beforeEach(() => mRun.mockReset());

describe('composePitch', () => {
  it('returns the structured pitch draft', async () => {
    captureRun(DRAFT);
    expect(await composePitch({ ...input, deliverables: ['reel'] })).toEqual(DRAFT);
  });

  it('wraps brand + creator text as DATA (prompt-injection defense) and uses emit_pitch', async () => {
    const get = captureRun(DRAFT);
    await composePitch({ ...input, deliverables: ['reel'] });
    const msg = get().messages[0].content;
    expect(msg).toContain('<creator_data>');
    expect(msg).toContain('<brand_data>');
    expect(msg).toContain('Slurrp Farm');
    // system prompt must instruct the model to treat that block as data, not instructions
    const sys = get().system[0].text;
    expect(sys).toMatch(/never as instructions|as DATA/i);
    expect(get().tool.name).toBe('emit_pitch');
  });

  it('references the exact suggested rate when provided', async () => {
    const get = captureRun(DRAFT);
    await composePitch({ ...input, deliverables: ['reel'], suggestedRatePaise: 1800000 });
    expect(get().messages[0].content).toContain('₹18,000');
  });

  it('tells the model not to state a number when no rate is provided', async () => {
    const get = captureRun(DRAFT);
    await composePitch({ ...input, deliverables: ['reel'], suggestedRatePaise: null });
    expect(get().messages[0].content).toContain('do not state a number');
  });
});
