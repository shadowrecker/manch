import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  cached: (t: string) => ({ type: 'text', text: t, cache_control: { type: 'ephemeral' } }),
  runToolCall: vi.fn(),
}));

import { synthesizeVerdict } from '@/lib/modules/check/ai/prompts/verdict';
import { runToolCall } from '@/lib/ai/claude';
import type { Evidence } from '@/lib/modules/check/corpus/search';

const mRun = vi.mocked(runToolCall);

interface RunParams {
  messages: { content: string }[];
  tool: { name: string };
}
function capture(result: unknown) {
  let captured: RunParams | null = null;
  mRun.mockImplementation((p) => {
    captured = p as unknown as RunParams;
    return Promise.resolve(result) as never;
  });
  return () => captured as unknown as RunParams;
}

const evidence: Evidence[] = [
  { id: 'c1', source: 'pib', title: 'PIB Fact Check', url: 'https://pib.gov.in/x', chunk: 'No such tax was announced.', distance: 0.1 },
];

beforeEach(() => mRun.mockReset());

describe('synthesizeVerdict', () => {
  it('maps the tool output into a Verdict, clamps the score, dedupes sources', async () => {
    capture({
      trust_score: 12, // out of range → clamped to 10
      verdict_label: 'false',
      explanation: 'The tax claim is false per PIB.',
      claim_verdicts: [
        { claim: 'New UPI tax announced', verdict: 'refuted', sources: [{ title: 'PIB', url: 'https://pib.gov.in/x' }, { title: 'dupe', url: 'https://pib.gov.in/x' }] },
      ],
    });
    const v = await synthesizeVerdict('forward', [{ claim: 'New UPI tax announced', evidence }]);
    expect(v.trustScore).toBe(10);
    expect(v.label).toBe('false');
    expect(v.language).toBe('en');
    expect(v.claims[0].verdict).toBe('refuted');
    expect(v.sources).toHaveLength(1); // deduped by url
  });

  it('feeds the claim + evidence into the prompt and uses emit_verdict', async () => {
    const get = capture({ trust_score: 5, verdict_label: 'unverified', explanation: 'x', claim_verdicts: [] });
    await synthesizeVerdict('the forward text', [{ claim: 'a specific claim', evidence }]);
    const msg = get().messages[0].content;
    expect(msg).toContain('a specific claim');
    expect(msg).toContain('No such tax was announced.');
    expect(get().tool.name).toBe('emit_verdict');
  });
});
