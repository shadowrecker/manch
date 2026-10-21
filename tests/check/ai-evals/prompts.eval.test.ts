import { describe, it, expect } from 'vitest';
import { extractClaims } from '@/lib/modules/check/ai/prompts/claims';
import { synthesizeVerdict } from '@/lib/modules/check/ai/prompts/verdict';
import { verifyTranslationFidelity } from '@/lib/modules/check/ai/prompts/translate-qa';
import type { Evidence } from '@/lib/modules/check/corpus/search';

// AI golden gates (PRD §16). Run ONLY with ANTHROPIC_API_KEY; skip cleanly in CI.
// These assert the SHAPE + the safety posture (humility) of each AI surface.
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_KEY)('AI prompt golden gates (live)', () => {
  it(
    'claims: extracts verifiable claims, ignores exhortations',
    async () => {
      const claims = await extractClaims(
        'BREAKING: The government has banned UPI payments above ₹2000 from tomorrow! Forward to everyone immediately!!',
      );
      expect(claims.length).toBeGreaterThan(0);
      expect(claims.join(' ').toLowerCase()).toContain('upi');
    },
    60_000,
  );

  it(
    'verdict: refutes a claim with strong contrary evidence and cites sources',
    async () => {
      const evidence: Evidence[] = [
        { id: 'c1', source: 'pib', title: 'PIB Fact Check', url: 'https://pib.gov.in/x', chunk: 'The government has issued no notification banning or taxing UPI payments. The viral message is fake.', distance: 0.05 },
      ];
      const v = await synthesizeVerdict('Govt banned UPI above 2000', [{ claim: 'The government banned UPI payments above ₹2000', evidence }]);
      expect(['false', 'misleading']).toContain(v.label);
      expect(v.trustScore).toBeLessThanOrEqual(4);
      expect(v.sources.length).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    'THE HUMILITY GATE: with NO evidence, the verdict is not confidently true',
    async () => {
      const v = await synthesizeVerdict('Some obscure unverifiable claim about a local event', [
        { claim: 'An unverifiable local claim', evidence: [] },
      ]);
      expect(v.label).not.toBe('verified');
      expect(v.trustScore).toBeLessThanOrEqual(6);
    },
    60_000,
  );

  it(
    'translation fidelity: flags a polarity flip',
    async () => {
      // English says false; the "translation" says true → must be caught.
      const faithful = await verifyTranslationFidelity('This claim is false.', 'यह दावा बिल्कुल सच है।', 'hi', 'false');
      expect(faithful).toBe(false);
    },
    60_000,
  );
});

describe('ai-eval harness', () => {
  it('is wired (functions importable)', () => {
    expect(typeof extractClaims).toBe('function');
    expect(typeof synthesizeVerdict).toBe('function');
    expect(typeof verifyTranslationFidelity).toBe('function');
  });
});
