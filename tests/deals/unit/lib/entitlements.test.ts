import { describe, it, expect } from 'vitest';
import {
  PLANS,
  FAIR_USE_CAP,
  planLimits,
  mediaKitQuota,
  pitchQuota,
  canMatch,
  canRate,
  canTrackDeals,
  canReviewContracts,
} from '@/lib/modules/deals/entitlements';

describe('plan limits (PRD §21)', () => {
  it('free: 1 media kit, 3 pitches, no match/rate/deals', () => {
    expect(PLANS.free.mediaKitsPerMonth).toBe(1);
    expect(PLANS.free.pitchesPerMonth).toBe(3);
    expect(canMatch('free')).toBe(false);
    expect(canRate('free')).toBe(false);
    expect(canTrackDeals('free')).toBe(false);
  });
  it('plus (Deals creator tier): unlimited kits, 10 pitches, match + rate + deals, no contract review', () => {
    expect(PLANS.creator.mediaKitsPerMonth).toBe(FAIR_USE_CAP);
    expect(PLANS.creator.pitchesPerMonth).toBe(10);
    expect(canMatch('plus')).toBe(true);
    expect(canRate('plus')).toBe(true);
    expect(canTrackDeals('plus')).toBe(true);
    expect(canReviewContracts('plus')).toBe(false);
  });
  it('pro: unlimited pitches + contract review', () => {
    expect(PLANS.pro.pitchesPerMonth).toBe(FAIR_USE_CAP);
    expect(canReviewContracts('pro')).toBe(true);
  });
  it('unknown plan falls back to free', () => {
    // @ts-expect-error runtime fallback
    expect(planLimits('nonsense').pitchesPerMonth).toBe(3);
  });
});

describe('quotas', () => {
  it('media-kit quota: free exceeded after 1', () => {
    expect(mediaKitQuota('free', 0).exceeded).toBe(false);
    expect(mediaKitQuota('free', 1).exceeded).toBe(true);
    expect(mediaKitQuota('plus', 50).unlimited).toBe(true);
  });
  it('pitch quota: free exceeded after 3, plus after 10', () => {
    expect(pitchQuota('free', 3).exceeded).toBe(true);
    expect(pitchQuota('plus', 9).exceeded).toBe(false);
    expect(pitchQuota('plus', 10).exceeded).toBe(true);
    expect(pitchQuota('pro', 500).unlimited).toBe(true);
  });
});

describe('Manch plan → Deals tier mapping (dealsTier)', () => {
  it('plus→creator, pro→pro, team→pro, brand→brand', () => {
    expect(planLimits('plus')).toBe(PLANS.creator);
    expect(planLimits('pro')).toBe(PLANS.pro);
    expect(planLimits('team')).toBe(PLANS.pro);
    expect(planLimits('brand')).toBe(PLANS.brand);
  });
  it('sales-led Check plans get the free Deals tier', () => {
    expect(planLimits('newsroom')).toBe(PLANS.free);
    expect(planLimits('telco')).toBe(PLANS.free);
    expect(planLimits('grant')).toBe(PLANS.free);
  });
  it('brand accounts can match + rate but not pitch or track deals', () => {
    expect(canMatch('brand')).toBe(true);
    expect(canRate('brand')).toBe(true);
    expect(canTrackDeals('brand')).toBe(false);
    expect(pitchQuota('brand', 0).exceeded).toBe(true);
  });
});
