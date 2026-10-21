import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/deals/services/rates', () => ({ getRateCardWithRationale: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { rateViewed: 'rate_viewed' } }));

import { POST } from '@/app/api/deals/rates/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { rateLimit } from '@/lib/ratelimit';
import { getRateCardWithRationale } from '@/lib/modules/deals/services/rates';

const mUser = vi.mocked(getUser);
const mPlan = vi.mocked(getPlan);
const mRl = vi.mocked(rateLimit);
const mCard = vi.mocked(getRateCardWithRationale);

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mPlan.mockResolvedValue('plus');
  mRl.mockResolvedValue({ success: true, remaining: 9 } as never);
  mCard.mockResolvedValue({ niche: 'beauty', band: 'micro', region: 'IN', rates: [], suggestedRatePaise: 1800000, rationale: 'tips' } as never);
});

describe('POST /api/deals/rates', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST())).status).toBe(401);
  });

  it('402 upgrade_required on the free plan', async () => {
    mPlan.mockResolvedValue('free');
    const { status, body } = await readJson(await POST());
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('upgrade_required');
    expect(mCard).not.toHaveBeenCalled();
  });

  it('429 when rate limited', async () => {
    mRl.mockResolvedValue({ success: false, remaining: 0 } as never);
    expect((await readJson(await POST())).status).toBe(429);
  });

  it('409 no_profile when the creator has no stats', async () => {
    mCard.mockResolvedValue(null);
    const { status, body } = await readJson(await POST());
    expect(status).toBe(409);
    expect((body as { code: string }).code).toBe('no_profile');
  });

  it('200 returns the rate card with rationale', async () => {
    const { status, body } = await readJson(await POST());
    expect(status).toBe(200);
    expect((body as { suggestedRatePaise: number }).suggestedRatePaise).toBe(1800000);
  });
});
