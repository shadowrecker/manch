import { describe, it, expect } from 'vitest';
import { composeMediaKit } from '@/lib/modules/deals/ai/prompts/mediakit';
import { composePitch } from '@/lib/modules/deals/ai/prompts/pitch';
import { rerankMatches, type RerankCandidate } from '@/lib/modules/deals/ai/prompts/match';
import { rateRationale } from '@/lib/modules/deals/ai/prompts/rate';
import type { RateBenchmark } from '@/lib/modules/deals/types';

// AI golden gates (PRD §16). Run ONLY with ANTHROPIC_API_KEY; skip cleanly in CI.
// These assert the SHAPE + non-emptiness of each AI surface against the live model.
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_KEY)('AI prompt golden gates (live)', () => {
  it(
    'media kit: returns all five non-empty sections',
    async () => {
      const out = await composeMediaKit({
        followers: 8500,
        engagementRate: 4.2,
        niche: ['home cooking'],
        contentStyle: 'warm, practical',
        city: 'Lucknow',
        topCategories: ['recipes'],
      });
      for (const k of ['headline', 'about', 'keyStatsNarrative', 'whyBrands', 'pricingNote'] as const) {
        expect(out[k].length).toBeGreaterThan(5);
      }
    },
    60_000,
  );

  it(
    'pitch: returns a subject + body that mentions the brand',
    async () => {
      const out = await composePitch({
        creator: { niche: ['home cooking'], followers: 8500, engagementRate: 4.2, city: 'Lucknow', contentStyle: 'warm' },
        brandName: 'Slurrp Farm',
        brandNiche: ['food', 'parenting'],
        brandAudience: 'parents',
        deliverables: ['reel'],
        suggestedRatePaise: 1800000,
      });
      expect(out.subject.length).toBeGreaterThan(3);
      expect(out.body.toLowerCase()).toContain('slurrp');
    },
    60_000,
  );

  it(
    'match rerank: scores candidates 1–100 with non-empty reasons',
    async () => {
      const candidates: RerankCandidate[] = [
        { brandId: 'b1', name: 'Slurrp Farm', niche: ['food', 'parenting'], targetAudience: 'parents', tierFocus: 'value', typicalCreatorSize: 'micro' },
        { brandId: 'b2', name: 'boAt', niche: ['tech', 'audio'], targetAudience: 'gen-z', tierFocus: 'value', typicalCreatorSize: 'macro' },
      ];
      const out = await rerankMatches(
        { niche: ['home cooking'], contentStyle: 'warm', city: 'Lucknow', followerBand: 'micro', followers: 8500, engagementRate: 4.2 },
        candidates,
      );
      expect(out.length).toBeGreaterThan(0);
      for (const m of out) {
        expect(m.fitScore).toBeGreaterThanOrEqual(1);
        expect(m.fitScore).toBeLessThanOrEqual(100);
        expect(m.reasons.length).toBeGreaterThan(0);
      }
      // The food brand should out-rank the unrelated tech brand for a food creator.
      const food = out.find((m) => m.brandId === 'b1');
      const tech = out.find((m) => m.brandId === 'b2');
      if (food && tech) expect(food.fitScore).toBeGreaterThanOrEqual(tech.fitScore);
    },
    60_000,
  );

  it(
    'rate rationale: returns a paragraph grounded in the benchmarks',
    async () => {
      const rates: RateBenchmark[] = [
        { deliverable: 'reel', p25Paise: 1080000, p50Paise: 1800000, p75Paise: 2880000, sampleSize: 62 },
      ];
      const out = await rateRationale({ niche: 'home cooking', band: 'micro', city: 'Lucknow', engagementRate: 4.2, rates });
      expect(out.length).toBeGreaterThan(20);
    },
    60_000,
  );
});

describe('ai-eval harness', () => {
  it('is wired (functions importable)', () => {
    expect(typeof composeMediaKit).toBe('function');
    expect(typeof composePitch).toBe('function');
    expect(typeof rerankMatches).toBe('function');
    expect(typeof rateRationale).toBe('function');
  });
});
