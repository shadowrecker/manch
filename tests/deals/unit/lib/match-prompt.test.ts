import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  cached: (t: string) => ({ type: 'text', text: t, cache_control: { type: 'ephemeral' } }),
  runToolCall: vi.fn(),
}));

import { rerankMatches, type RerankCandidate } from '@/lib/modules/deals/ai/prompts/match';
import { runToolCall } from '@/lib/ai/claude';

const mRun = vi.mocked(runToolCall);

const creator = {
  niche: ['home cooking'],
  contentStyle: 'warm',
  city: 'Lucknow',
  followerBand: 'micro',
  followers: 8500,
  engagementRate: 4.2,
};

const candidates: RerankCandidate[] = [
  { brandId: 'b1', name: 'Slurrp Farm', niche: ['food', 'parenting'], targetAudience: 'parents', tierFocus: 'value', typicalCreatorSize: 'micro' },
  { brandId: 'b2', name: 'boAt', niche: ['tech'], targetAudience: 'gen-z', tierFocus: 'value', typicalCreatorSize: 'macro' },
];

interface RunParams {
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

beforeEach(() => mRun.mockReset());

describe('rerankMatches', () => {
  it('lists candidate brand ids in the prompt and uses the rank_brands tool', async () => {
    const get = captureRun({ matches: [] });
    await rerankMatches(creator, candidates);
    const msg = get().messages[0].content;
    expect(msg).toContain('b1');
    expect(msg).toContain('Slurrp Farm');
    expect(msg).toContain('b2');
    expect(get().tool.name).toBe('rank_brands');
  });

  it('clamps scores to 1..100, sorts best-first, and caps reasons at 3', async () => {
    captureRun({
      matches: [
        { brand_id: 'b1', fit_score: 250, reasons: ['a', 'b', 'c', 'd'] },
        { brand_id: 'b2', fit_score: -5, reasons: ['x'] },
      ],
    });
    const out = await rerankMatches(creator, candidates);
    expect(out[0].brandId).toBe('b1');
    expect(out[0].fitScore).toBe(100);
    expect(out[0].reasons).toHaveLength(3);
    expect(out[1].brandId).toBe('b2');
    expect(out[1].fitScore).toBe(1);
  });

  it('tolerates a missing matches array', async () => {
    captureRun({});
    expect(await rerankMatches(creator, candidates)).toEqual([]);
  });
});
