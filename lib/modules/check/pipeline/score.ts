import type { LanguageCode, Verdict } from '@/lib/modules/check/types';

// Trust-score band for the UI badge (PRD verdict card).
export function scoreBand(score: number): 'high' | 'mid' | 'low' {
  if (score >= 7) return 'high';
  if (score >= 4) return 'mid';
  return 'low';
}

/**
 * The humility default (PRD §2/§9): when there is no reliable evidence, return an
 * honest "we couldn't verify this" — NEVER a confident wrong answer. Code-enforced
 * so the humility invariant is a deterministic test gate (§16), not just a prompt.
 */
export function unverifiedVerdict(language: LanguageCode = 'en'): Verdict {
  return {
    trustScore: 4,
    label: 'unverified',
    explanation:
      "We couldn't find enough reliable information to verify this. Please be cautious before sharing it — check an official source first.",
    claims: [],
    sources: [],
    language,
  };
}
