import { describe, it, expect } from 'vitest';
import { computeSplit } from '@/lib/modules/deals/payments/commission';
import { commissionPaise, COMMISSION_BPS } from '@/lib/modules/deals/types';

describe('commission math (the 5% CI gate)', () => {
  it('COMMISSION_BPS is 500 (5.00%)', () => {
    expect(COMMISSION_BPS).toBe(500);
  });

  it('commissionPaise takes 5% with half-up rounding', () => {
    expect(commissionPaise(2500000)).toBe(125000); // ₹25,000 → ₹1,250
    expect(commissionPaise(100000)).toBe(5000); // ₹1,000 → ₹50
    expect(commissionPaise(0)).toBe(0);
    expect(commissionPaise(199)).toBe(10); // 9.95 → 10 (round half up)
  });

  it('computeSplit gives platform 5% and creator the remainder (sums to value)', () => {
    const s = computeSplit(2500000);
    expect(s.commissionPaise).toBe(125000);
    expect(s.creatorPaise).toBe(2375000);
    expect(s.commissionPaise + s.creatorPaise).toBe(s.valuePaise);
    expect(s.bps).toBe(500);
  });

  it('never loses a paisa across odd amounts (commission + creator === value)', () => {
    for (const v of [1, 7, 99, 12345, 999999, 250000001]) {
      const s = computeSplit(v);
      expect(s.commissionPaise + s.creatorPaise).toBe(v);
    }
  });
});
