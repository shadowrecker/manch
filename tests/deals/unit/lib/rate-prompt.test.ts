import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  cached: (t: string) => ({ type: 'text', text: t, cache_control: { type: 'ephemeral' } }),
  runToolCall: vi.fn(),
}));

import { rateRationale } from '@/lib/modules/deals/ai/prompts/rate';
import { runToolCall } from '@/lib/ai/claude';
import type { RateBenchmark } from '@/lib/modules/deals/types';

const mRun = vi.mocked(runToolCall);

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

const rates: RateBenchmark[] = [
  { deliverable: 'reel', p25Paise: 1000000, p50Paise: 1800000, p75Paise: 2900000, sampleSize: 62 },
  { deliverable: 'story', p25Paise: 240000, p50Paise: 400000, p75Paise: 640000, sampleSize: 62 },
];

beforeEach(() => mRun.mockReset());

describe('rateRationale', () => {
  it('feeds the real benchmark figures into the prompt and uses the right tool', async () => {
    const get = captureRun({ rationale: 'Anchor at the median and go higher with strong engagement.' });
    const out = await rateRationale({ niche: 'beauty', band: 'micro', city: 'Mumbai', engagementRate: 5.1, rates });
    expect(out).toContain('Anchor at the median');
    const msg = get().messages[0].content;
    expect(msg).toContain('₹18,000'); // reel p50, formatted from paise
    expect(msg).toContain('use only these figures');
    expect(get().tool.name).toBe('emit_rate_rationale');
  });
});
