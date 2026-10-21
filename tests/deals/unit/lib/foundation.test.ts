import { describe, it, expect } from 'vitest';
import { commissionPaise, COMMISSION_BPS } from '@/lib/modules/deals/types';
import { TIERS, tierForPlan, COMMISSION_PCT } from '@/lib/pricing';
import { formatINR, monthPeriod } from '@/lib/utils';
import { followerBand } from '@/lib/modules/deals/utils';
import { EVENTS } from '@/lib/events';

describe('commission math (5% — PRD §21)', () => {
  it('₹50,000 deal = ₹2,500 commission', () => {
    expect(commissionPaise(50_000_00)).toBe(2_500_00); // paise
    expect(COMMISSION_BPS).toBe(500);
  });
  it('rounds to the nearest paise', () => {
    expect(commissionPaise(99_99)).toBe(Math.round((9999 * 500) / 10000));
  });
});

describe('pricing', () => {
  it('the Manch plans Deals maps to are on sale: plus featured at ₹149, pro, and brand (B2B)', () => {
    const plans = TIERS.map((t) => t.plan);
    expect(plans).toEqual(expect.arrayContaining(['free', 'plus', 'pro', 'brand']));
    expect(TIERS.find((t) => t.plan === 'plus')?.featured).toBe(true);
    expect(TIERS.find((t) => t.plan === 'brand')?.b2b).toBe(true);
    expect(TIERS.find((t) => t.plan === 'plus')?.priceMonthly).toBe('₹149');
  });
  it('COMMISSION_PCT is 5 (matches COMMISSION_BPS); tierForPlan falls back to free', () => {
    expect(COMMISSION_PCT).toBe(5);
    expect(COMMISSION_PCT * 100).toBe(COMMISSION_BPS);
    // @ts-expect-error runtime fallback
    expect(tierForPlan('nope').plan).toBe('free');
  });
});

describe('utils', () => {
  it('formatINR (paise → ₹ with Indian grouping)', () => {
    expect(formatINR(250000)).toBe('₹2,500');
    expect(formatINR(150000000)).toBe('₹15,00,000');
    expect(formatINR(null)).toBe('₹0');
  });
  it('followerBand', () => {
    expect(followerBand(5000)).toBe('nano');
    expect(followerBand(50_000)).toBe('micro');
    expect(followerBand(500_000)).toBe('mid');
    expect(followerBand(2_000_000)).toBe('macro');
  });
  it('monthPeriod is the 1st of the month UTC', () => {
    expect(monthPeriod(new Date('2026-06-11T18:00:00Z'))).toBe('2026-06-01');
  });
});

describe('events taxonomy', () => {
  it('has the money-loop events with unique snake_case values', () => {
    expect(EVENTS.commissionCollected).toBe('commission_collected');
    expect(EVENTS.mediaKitGenerated).toBe('media_kit_generated');
    const v = Object.values(EVENTS);
    expect(new Set(v).size).toBe(v.length);
  });
});
