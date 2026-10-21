import { describe, it, expect } from 'vitest';
import { TIERS, CONSUMER_TIERS, MAKEOVER_PRICE_PAISE, tierForPlan } from '@/lib/pricing';

// Pricing now comes from the shared Manch core: one plan ladder for every module.
// Folio's free/solo/pro/team ladder maps to Manch free/plus/pro/team.

describe('TIERS (consumer ladder)', () => {
  it('has the 4 consumer plans in free/plus/pro/team order', () => {
    expect(CONSUMER_TIERS).toHaveLength(4);
    expect(CONSUMER_TIERS.map((t) => t.plan)).toEqual(['free', 'plus', 'pro', 'team']);
  });

  it('marks exactly one consumer tier as featured (plus)', () => {
    const featured = CONSUMER_TIERS.filter((t) => t.featured);
    expect(featured).toHaveLength(1);
    expect(featured[0].plan).toBe('plus');
  });

  it('gives every tier a non-empty feats list and core string fields', () => {
    for (const t of TIERS) {
      expect(Array.isArray(t.feats)).toBe(true);
      expect(t.feats.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.priceMonthly).toBe('string');
      expect(typeof t.sub).toBe('string');
    }
  });

  it('omits a yearly price on free but includes one on paid consumer tiers', () => {
    const free = TIERS.find((t) => t.plan === 'free')!;
    expect(free.priceYearly).toBeUndefined();
    for (const plan of ['plus', 'pro', 'team'] as const) {
      const tier = TIERS.find((t) => t.plan === plan)!;
      expect(typeof tier.priceYearly).toBe('string');
      expect(tier.priceYearly!.length).toBeGreaterThan(0);
    }
  });

  it('advertises the Post limits on the free and plus tiers', () => {
    expect(tierForPlan('free').feats.join(' ')).toMatch(/4 LinkedIn posts/);
    expect(tierForPlan('plus').feats.join(' ')).toMatch(/20 LinkedIn posts/);
  });
});

describe('tierForPlan', () => {
  it('returns the matching tier for each consumer plan', () => {
    expect(tierForPlan('free').plan).toBe('free');
    expect(tierForPlan('plus').plan).toBe('plus');
    expect(tierForPlan('pro').plan).toBe('pro');
    expect(tierForPlan('team').plan).toBe('team');
  });

  it('falls back to the free tier for an unknown plan', () => {
    // @ts-expect-error exercising the runtime fallback with an invalid plan
    expect(tierForPlan('enterprise').plan).toBe('free');
    expect(tierForPlan('free')).toBe(TIERS[0]);
  });
});

describe('MAKEOVER_PRICE_PAISE', () => {
  it('is 19900 paise (₹199)', () => {
    expect(MAKEOVER_PRICE_PAISE).toBe(19900);
  });
});
