import type Anthropic from '@anthropic-ai/sdk';
import { cached, runToolCall } from '@/lib/ai/claude';
import { clampTrustScore, type ClaimVerdict, type Source, type Verdict, type VerdictLabel } from '@/lib/modules/check/types';
import type { Evidence } from '@/lib/modules/check/corpus/search';

// Verdict synthesis (PRD §29 / §9). Given the claims + retrieved evidence, produce
// a trust score (1–10) + plain-language verdict, in English (translated later).
//
// HUMILITY: cite ONLY the provided evidence; thin evidence → `unverified`, never a
// confident wrong answer; no defamatory assertion about a named individual.

export interface ClaimEvidence {
  claim: string;
  evidence: Evidence[];
}

const SYSTEM = `You are a careful, neutral fact-checker for Indian WhatsApp forwards.

You are given a forward, its extracted claims, and EVIDENCE retrieved from verified
fact-check sources (PIB, BOOM, AltNews, Wikipedia, major newspapers). Adjudicate each
claim ONLY against that evidence and write a short, plain-language verdict (grade-8
reading level, non-technical).

Hard rules:
- Cite ONLY the provided evidence. Never invent a source or a fact.
- If the evidence does not clearly support OR refute a claim, mark it 'unverified'.
  Under-claim — "we could not verify this" is the correct, safe answer.
- Do NOT assert that a named individual committed a crime or wrongdoing beyond what
  the evidence states.
- trust_score: 8–10 = well-supported as true; 4–7 = mixed/partly misleading;
  1–3 = refuted/false. Use 'unverified' + a mid-low score when evidence is thin.
- verdict_label is one of: verified | misleading | false | unverified | manipulated.`;

const TOOL: Anthropic.Tool = {
  name: 'emit_verdict',
  description: 'Return the trust score, overall verdict, and per-claim adjudication.',
  input_schema: {
    type: 'object',
    properties: {
      trust_score: { type: 'integer', description: '1-10' },
      verdict_label: { type: 'string', enum: ['verified', 'misleading', 'false', 'unverified', 'manipulated'] },
      explanation: { type: 'string', description: 'Plain-language, grade-8, a few sentences.' },
      claim_verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string' },
            verdict: { type: 'string', enum: ['supported', 'refuted', 'unverified'] },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: { title: { type: 'string' }, url: { type: 'string' }, publisher: { type: 'string' } },
                required: ['title', 'url'],
              },
            },
          },
          required: ['claim', 'verdict', 'sources'],
        },
      },
    },
    required: ['trust_score', 'verdict_label', 'explanation', 'claim_verdicts'],
  },
};

interface RawVerdict {
  trust_score: number;
  verdict_label: VerdictLabel;
  explanation: string;
  claim_verdicts: { claim: string; verdict: ClaimVerdict; sources: Source[] }[];
}

export async function synthesizeVerdict(forward: string, claimEvidence: ClaimEvidence[]): Promise<Verdict> {
  const evidenceBlock = claimEvidence
    .map((ce, i) => {
      const ev = ce.evidence.length
        ? ce.evidence.map((e) => `  - [${e.source}] ${e.title ?? ''} ${e.url ?? ''}\n    ${e.chunk}`).join('\n')
        : '  - (no evidence found)';
      return `CLAIM ${i + 1}: ${ce.claim}\nEVIDENCE:\n${ev}`;
    })
    .join('\n\n');

  const userMsg = [`<forward>\n${forward}\n</forward>`, '', evidenceBlock].join('\n');

  const out = await runToolCall<RawVerdict>({
    system: [cached(SYSTEM)],
    messages: [{ role: 'user', content: userMsg }],
    tool: TOOL,
    maxTokens: 1500,
    temperature: 0.2,
  });

  const claims = (out.claim_verdicts ?? []).map((c) => ({
    text: c.claim,
    verdict: c.verdict,
    confidence: c.verdict === 'unverified' ? 0.4 : 0.85,
    sources: c.sources ?? [],
  }));
  const sources = dedupeSources(claims.flatMap((c) => c.sources));

  return {
    trustScore: clampTrustScore(out.trust_score),
    label: out.verdict_label,
    explanation: out.explanation,
    claims,
    sources,
    language: 'en',
  };
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out.slice(0, 8);
}
