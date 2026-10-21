import type Anthropic from '@anthropic-ai/sdk';
import { cached, runToolCall } from '@/lib/ai/claude';

// Brand-match rerank (PRD §9 / C-02). Given the creator profile + a pgvector
// shortlist, score each brand 1–100 with plain, explainable reasons.
// Explainability is the feature — reasons must cite WHY (niche/audience/tier).

export interface RerankCandidate {
  brandId: string;
  name: string;
  niche: string[];
  targetAudience: string | null;
  tierFocus: string | null;
  typicalCreatorSize: string | null;
}

export interface RerankCreator {
  niche: string[];
  contentStyle: string | null;
  city: string | null;
  followerBand: string | null;
  followers: number | null;
  engagementRate: number | null;
}

export interface RankedMatch {
  brandId: string;
  fitScore: number;
  reasons: string[];
}

const SYSTEM = `You match Indian creators to brands for sponsorship deals.

Score each candidate brand 1–100 for how well it fits THIS creator, where:
- 80–100: strong fit (clear niche + audience + tier overlap)
- 50–79: plausible fit (some overlap, worth a pitch)
- 1–49: weak fit (little overlap)

For every brand give 1–3 short reasons that cite the SPECIFIC overlap (shared niche,
audience match, creator-size/tier fit). Be honest — do not inflate scores. Reasons
must be concrete and skimmable, not generic marketing language.`;

const TOOL: Anthropic.Tool = {
  name: 'rank_brands',
  description: 'Return a fit score (1-100) and reasons for each candidate brand.',
  input_schema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            brand_id: { type: 'string' },
            fit_score: { type: 'integer', description: '1-100 fit score' },
            reasons: { type: 'array', items: { type: 'string' }, description: '1-3 concrete reasons' },
          },
          required: ['brand_id', 'fit_score', 'reasons'],
        },
      },
    },
    required: ['matches'],
  },
};

interface RawRank {
  matches: { brand_id: string; fit_score: number; reasons: string[] }[];
}

export async function rerankMatches(creator: RerankCreator, candidates: RerankCandidate[]): Promise<RankedMatch[]> {
  const creatorMsg = [
    `CREATOR: ${creator.niche.join(', ') || 'general'} creator.`,
    `Content style: ${creator.contentStyle ?? '—'}. City: ${creator.city ?? '—'}.`,
    `Size: ${creator.followerBand ?? '—'} band, ${creator.followers ?? '—'} followers, ${creator.engagementRate ?? '—'}% engagement.`,
    '',
    'CANDIDATE BRANDS (score each by brand_id):',
    ...candidates.map(
      (c) =>
        `- ${c.brandId} | ${c.name} | categories: ${c.niche.join(', ') || '—'} | audience: ${c.targetAudience ?? '—'} | tier: ${c.tierFocus ?? '—'} | creator-size: ${c.typicalCreatorSize ?? '—'}`,
    ),
  ].join('\n');

  const out = await runToolCall<RawRank>({
    system: [cached(SYSTEM)],
    messages: [{ role: 'user', content: creatorMsg }],
    tool: TOOL,
    maxTokens: 2000,
    temperature: 0.3,
  });

  return (out.matches ?? [])
    .map((m) => ({
      brandId: m.brand_id,
      fitScore: Math.max(1, Math.min(100, Math.round(m.fit_score))),
      reasons: (m.reasons ?? []).slice(0, 3),
    }))
    .sort((a, b) => b.fitScore - a.fitScore);
}
