import { describe, it, expect } from 'vitest';
import { checkQuota, canCheckMedia, languageAllowed, canUseApi, planLimits, FAIR_USE_CAP, TIER_LIMITS } from '@/lib/modules/check/entitlements';
import { checkTier } from '@/lib/plans';

describe('entitlements — the 5-stream matrix (PRD §27)', () => {
  it('free: 10 text-only checks, English/Hindi only, no API', () => {
    expect(checkQuota('free', 0).limit).toBe(10);
    expect(checkQuota('free', 10).exceeded).toBe(true);
    expect(canCheckMedia('free', 'text')).toBe(true);
    expect(canCheckMedia('free', 'image')).toBe(false);
    expect(canCheckMedia('free', 'video')).toBe(false);
    expect(languageAllowed('free', 'hi')).toBe(true);
    expect(languageAllowed('free', 'en')).toBe(true);
    expect(languageAllowed('free', 'ta')).toBe(false);
    expect(canUseApi('free')).toBe(false);
  });

  it('plus (Check personal tier): unlimited checks, all media + languages, no API', () => {
    expect(checkQuota('plus', 500).exceeded).toBe(false);
    expect(checkQuota('plus', 0).unlimited).toBe(true);
    expect(canCheckMedia('plus', 'video')).toBe(true);
    expect(languageAllowed('plus', 'ta')).toBe(true);
    expect(canUseApi('plus')).toBe(false);
  });

  it('newsroom / telco / grant: media + all languages + API', () => {
    for (const p of ['newsroom', 'telco', 'grant'] as const) {
      expect(canCheckMedia(p, 'video')).toBe(true);
      expect(languageAllowed(p, 'ml')).toBe(true);
      expect(canUseApi(p)).toBe(true);
    }
  });

  it('FAIR_USE_CAP marks the unlimited plans', () => {
    expect(planLimits('plus').checksPerMonth).toBe(FAIR_USE_CAP);
    expect(planLimits('free').checksPerMonth).toBeLessThan(FAIR_USE_CAP);
  });

  it('pro / team / brand all map to the Check personal tier (no API)', () => {
    for (const p of ['pro', 'team', 'brand'] as const) {
      expect(planLimits(p)).toEqual(TIER_LIMITS.personal);
      expect(canUseApi(p)).toBe(false);
    }
  });

  it('every function maps the Manch plan via checkTier()', () => {
    for (const p of ['free', 'plus', 'pro', 'team', 'brand', 'newsroom', 'telco', 'grant'] as const) {
      expect(planLimits(p)).toBe(TIER_LIMITS[checkTier(p)]);
    }
  });

  it('an unknown/legacy plan value is treated as free', () => {
    expect(planLimits('personal' as never)).toBe(TIER_LIMITS.free);
  });

  it('url inputs are always allowed (treated like text)', () => {
    expect(canCheckMedia('free', 'url')).toBe(true);
  });
});
