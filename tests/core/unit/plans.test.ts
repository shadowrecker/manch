import { describe, it, expect } from 'vitest';
import {
  MODULE_TIERS,
  PLANS,
  checkTier,
  dealsTier,
  isPaid,
  isSelfServe,
  moduleTiers,
  normalisePlan,
  postTier,
  reelsTier,
} from '@/lib/plans';
import { TIERS, CONSUMER_TIERS, B2B_TIERS, tierForPlan } from '@/lib/pricing';

describe('lib/plans', () => {
  it('maps every Manch plan to exactly one tier per module', () => {
    for (const plan of PLANS) {
      const t = MODULE_TIERS[plan];
      expect(Object.keys(t).sort()).toEqual(['check', 'deals', 'post', 'reels']);
    }
  });

  it('Plus unlocks the entry paid tier of every module', () => {
    expect(moduleTiers('plus')).toEqual({ post: 'solo', reels: 'bharat', deals: 'creator', check: 'personal' });
  });

  it('Team is a superset of Pro (agency + team seats)', () => {
    expect(postTier('team')).toBe('team');
    expect(reelsTier('team')).toBe('agency');
    expect(dealsTier('team')).toBe(dealsTier('pro'));
    expect(checkTier('team')).toBe(checkTier('pro'));
  });

  it('B2B plans unlock only their own module', () => {
    expect(dealsTier('brand')).toBe('brand');
    expect(postTier('brand')).toBe('free');
    expect(checkTier('newsroom')).toBe('newsroom');
    expect(reelsTier('newsroom')).toBe('free');
  });

  it('normalises unknown / legacy / missing plans to free (fail closed)', () => {
    expect(normalisePlan(undefined)).toBe('free');
    expect(normalisePlan(null)).toBe('free');
    expect(normalisePlan('solo')).toBe('free');
    expect(normalisePlan('hacker')).toBe('free');
    expect(normalisePlan('pro')).toBe('pro');
    expect(postTier('bogus')).toBe('free');
  });

  it('isPaid / isSelfServe', () => {
    expect(isPaid('free')).toBe(false);
    expect(isPaid('plus')).toBe(true);
    expect(isSelfServe('plus')).toBe(true);
    expect(isSelfServe('brand')).toBe(true);
    expect(isSelfServe('newsroom')).toBe(false);
    expect(isSelfServe('free')).toBe(false);
  });
});

describe('lib/pricing', () => {
  it('has a tier for every self-serve plan and splits consumer vs B2B', () => {
    for (const p of ['free', 'plus', 'pro', 'team', 'brand'] as const) {
      expect(tierForPlan(p).plan).toBe(p);
    }
    expect(CONSUMER_TIERS.map((t) => t.plan)).toEqual(['free', 'plus', 'pro', 'team']);
    expect(B2B_TIERS.every((t) => t.b2b)).toBe(true);
    expect(TIERS.filter((t) => t.featured)).toHaveLength(1);
  });

  it('sales-led tiers are contact-only', () => {
    expect(tierForPlan('newsroom').contactSales).toBe(true);
    expect(tierForPlan('brand').contactSales).toBeFalsy();
  });
});
