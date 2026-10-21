import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/modules/deals/queries', () => ({ getMonthlyUsage: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/deals/services/mediakit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/deals/services/mediakit')>('@/lib/modules/deals/services/mediakit');
  return { generateMediaKitForUser: vi.fn(), NoMetricsError: actual.NoMetricsError };
});

import { POST } from '@/app/api/deals/media-kit/generate/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { getMonthlyUsage } from '@/lib/modules/deals/queries';
import { rateLimit } from '@/lib/ratelimit';
import { generateMediaKitForUser, NoMetricsError } from '@/lib/modules/deals/services/mediakit';

const mUser = vi.mocked(getUser);
const mPlan = vi.mocked(getPlan);
const mUsage = vi.mocked(getMonthlyUsage);
const mRl = vi.mocked(rateLimit);
const mGen = vi.mocked(generateMediaKitForUser);

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mPlan.mockResolvedValue('free');
  mUsage.mockResolvedValue({ mediaKits: 0, pitches: 0 });
  mRl.mockResolvedValue({ success: true, remaining: 9, limit: 10, reset: 0 } as never);
  mGen.mockResolvedValue({
    kitId: 'k1',
    shareId: 'share12345',
    data: { headline: 'H', about: 'A', keyStatsNarrative: 'K', whyBrands: 'W', pricingNote: 'P' },
    metrics: { followers: 8500, engagementRate: 4.2, avgLikes: 300, avgComments: 25, topCategories: [], audience: null },
  });
});

describe('POST /api/deals/media-kit/generate', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST())).status).toBe(401);
  });

  it('429 when rate limited', async () => {
    mRl.mockResolvedValue({ success: false, remaining: 0, limit: 10, reset: 0 } as never);
    expect((await readJson(await POST())).status).toBe(429);
  });

  it('402 limit_reached when the free kit is used up', async () => {
    mUsage.mockResolvedValue({ mediaKits: 1, pitches: 0 });
    const { status, body } = await readJson(await POST());
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('limit_reached');
    expect(mGen).not.toHaveBeenCalled();
  });

  it('allows unlimited kits on a paid plan', async () => {
    mPlan.mockResolvedValue('plus');
    mUsage.mockResolvedValue({ mediaKits: 12, pitches: 0 });
    expect((await readJson(await POST())).status).toBe(200);
    expect(mGen).toHaveBeenCalledWith('user-1');
  });

  it('409 no_metrics when the creator has no stats yet', async () => {
    mGen.mockRejectedValue(new NoMetricsError());
    const { status, body } = await readJson(await POST());
    expect(status).toBe(409);
    expect((body as { code: string }).code).toBe('no_metrics');
  });

  it('200 returns the generated kit', async () => {
    const { status, body } = await readJson(await POST());
    expect(status).toBe(200);
    expect((body as { shareId: string }).shareId).toBe('share12345');
  });

  it('500 on an unexpected failure', async () => {
    mGen.mockRejectedValue(new Error('claude down'));
    expect((await readJson(await POST())).status).toBe(500);
  });
});
