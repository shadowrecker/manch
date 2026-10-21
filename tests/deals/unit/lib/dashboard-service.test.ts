import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/modules/deals/queries', () => ({
  getMonthlyUsage: vi.fn(),
  getLatestMetrics: vi.fn(),
  getLatestMediaKit: vi.fn(),
  getBrandMatches: vi.fn(),
}));
vi.mock('@/lib/modules/deals/services/deals', () => ({ listDeals: vi.fn() }));

import { getDashboardData } from '@/lib/modules/deals/services/dashboard';
import { getPlan } from '@/lib/db/queries';
import { getMonthlyUsage, getLatestMetrics, getLatestMediaKit, getBrandMatches } from '@/lib/modules/deals/queries';
import { listDeals } from '@/lib/modules/deals/services/deals';

beforeEach(() => {
  vi.mocked(getPlan).mockResolvedValue('plus');
  vi.mocked(getMonthlyUsage).mockResolvedValue({ mediaKits: 2, pitches: 4 });
  vi.mocked(getLatestMetrics).mockResolvedValue({ followers: 8500, engagement_rate: 4.2 } as never);
  vi.mocked(getLatestMediaKit).mockResolvedValue({ share_id: 'abc123' } as never);
  vi.mocked(getBrandMatches).mockResolvedValue([
    { brandId: 'b1', name: 'Slurrp Farm', fitScore: 88, reasons: [] },
    { brandId: 'b2', name: 'boAt', fitScore: 60, reasons: [] },
  ] as never);
  vi.mocked(listDeals).mockResolvedValue([
    { value_paise: 2500000, commission_paise: 125000, commission_status: 'collected' },
    { value_paise: 1000000, commission_paise: 50000, commission_status: 'collected' },
    { value_paise: 500000, commission_paise: 25000, commission_status: 'pending' },
    { value_paise: null, commission_paise: null, commission_status: 'none' },
  ] as never);
});

describe('getDashboardData', () => {
  it('aggregates GMV + commission from collected deals only', async () => {
    const d = await getDashboardData('u1');
    expect(d.deals.total).toBe(4);
    expect(d.deals.collected).toBe(2);
    expect(d.deals.pending).toBe(1);
    expect(d.deals.gmvPaise).toBe(3500000); // 25,000 + 10,000 (pending + none excluded)
    expect(d.deals.commissionPaise).toBe(175000);
  });

  it('surfaces wedge status: metrics, kit share id, and top match', async () => {
    const d = await getDashboardData('u1');
    expect(d.hasMetrics).toBe(true);
    expect(d.followers).toBe(8500);
    expect(d.kitShareId).toBe('abc123');
    expect(d.matchesCount).toBe(2);
    expect(d.topMatch).toEqual({ name: 'Slurrp Farm', fitScore: 88 });
  });

  it('degrades cleanly for a brand-new creator', async () => {
    vi.mocked(getLatestMetrics).mockResolvedValue(null);
    vi.mocked(getLatestMediaKit).mockResolvedValue(null);
    vi.mocked(getBrandMatches).mockResolvedValue([]);
    vi.mocked(listDeals).mockResolvedValue([]);
    const d = await getDashboardData('u1');
    expect(d.hasMetrics).toBe(false);
    expect(d.kitShareId).toBeNull();
    expect(d.topMatch).toBeNull();
    expect(d.deals).toEqual({ total: 0, pending: 0, collected: 0, gmvPaise: 0, commissionPaise: 0 });
  });
});
