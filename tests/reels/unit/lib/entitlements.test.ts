import { describe, it, expect } from 'vitest';
import {
  TIER_LIMITS,
  FAIR_USE_CAP,
  planLimits,
  quotaState,
  needsWatermark,
  canAgency,
  canRepurpose,
  applyWatermark,
  WATERMARK_TEXT,
  generationAllowance,
} from '@/lib/modules/reels/entitlements';

// Every function takes the Manch plan: plus → bharat, pro → creator, team → agency.
describe('plan limits', () => {
  it('free: 5 pieces, watermark on, no agency/repurpose', () => {
    expect(TIER_LIMITS.free.piecesPerMonth).toBe(5);
    expect(needsWatermark('free')).toBe(true);
    expect(canAgency('free')).toBe(false);
    expect(canRepurpose('free')).toBe(false);
  });

  it('plus (bharat): 30 pieces, no watermark, no repurpose', () => {
    expect(TIER_LIMITS.bharat.piecesPerMonth).toBe(30);
    expect(planLimits('plus').piecesPerMonth).toBe(30);
    expect(needsWatermark('plus')).toBe(false);
    expect(canRepurpose('plus')).toBe(false);
  });

  it('pro + team: fair-use cap, repurpose on; only team (agency) has seats/tools', () => {
    expect(TIER_LIMITS.creator.piecesPerMonth).toBe(FAIR_USE_CAP);
    expect(canRepurpose('pro')).toBe(true);
    expect(canAgency('pro')).toBe(false);
    expect(canAgency('team')).toBe(true);
    expect(TIER_LIMITS.agency.teamSeats).toBe(10); // one Manch Team plan = 10 seats across modules
    expect(planLimits('team').teamSeats).toBe(10);
  });

  it('unknown plan falls back to free', () => {
    // @ts-expect-error testing runtime fallback
    expect(planLimits('nonsense').piecesPerMonth).toBe(5);
  });

  it('B2B plans (brand / newsroom) get the free Reels tier', () => {
    expect(planLimits('brand').piecesPerMonth).toBe(5);
    expect(needsWatermark('newsroom')).toBe(true);
  });
});

describe('quotaState', () => {
  it('exceeded at the free limit', () => {
    expect(quotaState('free', 4).exceeded).toBe(false);
    expect(quotaState('free', 5).exceeded).toBe(true);
    expect(quotaState('free', 5).remaining).toBe(0);
  });
  it('flags unlimited tiers', () => {
    expect(quotaState('pro', 100).unlimited).toBe(true);
    expect(quotaState('plus', 1).unlimited).toBe(false);
  });
});

describe('applyWatermark', () => {
  it('appends once for free, never for paid', () => {
    expect(WATERMARK_TEXT).toBe('Made with Manch');
    const out = applyWatermark('हैलो', 'free');
    expect(out).toContain(WATERMARK_TEXT);
    expect(applyWatermark(out, 'free')).toBe(out);
    expect(applyWatermark('हैलो', 'plus')).toBe('हैलो');
  });
});

describe('generationAllowance (quota → credit → paywall)', () => {
  it('allows via quota when under the monthly limit', () => {
    const a = generationAllowance('free', 2, 0);
    expect(a.allowed).toBe(true);
    expect(a.via).toBe('quota');
  });
  it('falls back to a wallet credit when quota is exhausted', () => {
    const a = generationAllowance('free', 5, 3);
    expect(a.allowed).toBe(true);
    expect(a.via).toBe('credit');
  });
  it('blocks when quota AND credits are zero', () => {
    const a = generationAllowance('free', 5, 0);
    expect(a.allowed).toBe(false);
    expect(a.via).toBe('none');
  });
  it('prefers quota even when credits exist (does not waste credits)', () => {
    expect(generationAllowance('plus', 0, 10).via).toBe('quota');
  });
});
