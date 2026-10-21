import { describe, it, expect } from 'vitest';
import {
  PLANS,
  FAIR_USE_CAP,
  planLimits,
  quotaState,
  needsWatermark,
  canSchedule,
  canThread,
  applyWatermark,
  WATERMARK_TEXT,
} from '@/lib/modules/post/entitlements';

// Every entitlement function takes the Manch Plan (@/lib/plans) and maps it to
// the Post tier internally (plus → solo, pro → pro, team → team). The PLANS
// table itself stays keyed by the Post tier.

describe('plan limits', () => {
  it('free tier: 4 posts, watermark on, no scheduling', () => {
    expect(PLANS.free.postsPerMonth).toBe(4);
    expect(needsWatermark('free')).toBe(true);
    expect(canSchedule('free')).toBe(false);
    expect(canThread('free')).toBe(false);
  });

  it('plus (solo tier): 20 posts, no watermark, scheduling on, no threads', () => {
    expect(PLANS.solo.postsPerMonth).toBe(20);
    expect(planLimits('plus')).toBe(PLANS.solo);
    expect(needsWatermark('plus')).toBe(false);
    expect(canSchedule('plus')).toBe(true);
    expect(canThread('plus')).toBe(false);
  });

  it('pro + team: fair-use cap, threads on', () => {
    expect(PLANS.pro.postsPerMonth).toBe(FAIR_USE_CAP);
    expect(PLANS.team.postsPerMonth).toBe(FAIR_USE_CAP);
    expect(canThread('pro')).toBe(true);
    expect(canThread('team')).toBe(true);
    expect(PLANS.team.teamSeats).toBe(10);
  });

  it('unknown plan falls back to free limits', () => {
    // @ts-expect-error testing the runtime fallback path
    expect(planLimits('nonsense').postsPerMonth).toBe(4);
  });
});

describe('quotaState', () => {
  it('reports exceeded when used >= limit (free)', () => {
    expect(quotaState('free', 3).exceeded).toBe(false);
    expect(quotaState('free', 4).exceeded).toBe(true);
    expect(quotaState('free', 4).remaining).toBe(0);
  });

  it('flags unlimited tiers', () => {
    expect(quotaState('pro', 10).unlimited).toBe(true);
    expect(quotaState('plus', 10).unlimited).toBe(false);
  });
});

describe('applyWatermark', () => {
  it('appends watermark for free tier exactly once', () => {
    const out = applyWatermark('Hello world', 'free');
    expect(out).toContain(WATERMARK_TEXT);
    // idempotent
    expect(applyWatermark(out, 'free')).toBe(out);
  });

  it('never watermarks paid tiers', () => {
    expect(applyWatermark('Hello', 'plus')).toBe('Hello');
    expect(applyWatermark('Hello', 'pro')).toBe('Hello');
  });
});

describe('Manch plan → Post tier mapping', () => {
  it('B2B plans get the free Post tier (watermark, 4 posts)', () => {
    for (const plan of ['brand', 'newsroom', 'telco', 'grant'] as const) {
      expect(planLimits(plan)).toBe(PLANS.free);
      expect(needsWatermark(plan)).toBe(true);
    }
  });

  it('watermark text is the Manch brand', () => {
    expect(WATERMARK_TEXT).toBe('Written with Manch');
  });
});
