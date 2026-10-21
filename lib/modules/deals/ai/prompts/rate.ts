import type Anthropic from '@anthropic-ai/sdk';
import { cached, runToolCall } from '@/lib/ai/claude';
import { formatINR } from '@/lib/utils';
import type { RateBenchmark } from '@/lib/modules/deals/types';

// Rate-negotiation rationale (PRD §7.4 / §9, C-04). The NUMBERS come from
// rate_benchmarks — Claude only explains the negotiation position. It must not
// invent figures.

export interface RateRationaleInput {
  niche: string;
  band: string;
  city: string | null;
  engagementRate: number | null;
  rates: RateBenchmark[];
}

const SYSTEM = `You advise Indian creators on what to charge brands.

You are given REAL market benchmark figures (25th/50th/75th percentile) for this
creator's niche and audience size. Write ONE short paragraph explaining how to use
them to negotiate: where to anchor, when to go above the median (high engagement,
exclusivity, usage rights), and how to justify it to a brand. Use ONLY the figures
provided — never invent a number. Practical, confident, Indian context.`;

const TOOL: Anthropic.Tool = {
  name: 'emit_rate_rationale',
  description: 'Return a one-paragraph negotiation rationale grounded in the given benchmarks.',
  input_schema: {
    type: 'object',
    properties: { rationale: { type: 'string', description: 'One short negotiation paragraph.' } },
    required: ['rationale'],
  },
};

export async function rateRationale(input: RateRationaleInput): Promise<string> {
  const lines = input.rates.map(
    (r) =>
      `${r.deliverable}: p25 ${formatINR(r.p25Paise)} · p50 ${formatINR(r.p50Paise)} · p75 ${formatINR(r.p75Paise)} (n=${r.sampleSize ?? '—'})`,
  );
  const userMsg = [
    `CREATOR: ${input.niche} creator, ${input.band} audience, ${input.city ?? 'India'}, ${input.engagementRate ?? '—'}% engagement.`,
    'MARKET BENCHMARKS (use only these figures):',
    ...lines,
  ].join('\n');

  const out = await runToolCall<{ rationale: string }>({
    system: [cached(SYSTEM)],
    messages: [{ role: 'user', content: userMsg }],
    tool: TOOL,
    maxTokens: 600,
    temperature: 0.5,
  });
  return out.rationale;
}
