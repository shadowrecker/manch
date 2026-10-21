import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/modules/deals/queries', () => ({ getMonthlyUsage: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/deals/services/pitch', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/deals/services/pitch')>('@/lib/modules/deals/services/pitch');
  return {
    generatePitchForBrand: vi.fn(),
    normalizeDeliverables: actual.normalizeDeliverables,
    NoBrandError: actual.NoBrandError,
    NoProfileError: actual.NoProfileError,
  };
});

import { POST } from '@/app/api/deals/pitch/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { getMonthlyUsage } from '@/lib/modules/deals/queries';
import { rateLimit } from '@/lib/ratelimit';
import { generatePitchForBrand, NoBrandError, NoProfileError } from '@/lib/modules/deals/services/pitch';

const mUser = vi.mocked(getUser);
const mPlan = vi.mocked(getPlan);
const mUsage = vi.mocked(getMonthlyUsage);
const mRl = vi.mocked(rateLimit);
const mGen = vi.mocked(generatePitchForBrand);

const req = (b: unknown) => jsonRequest('http://test/api/deals/pitch', b);

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mPlan.mockResolvedValue('plus');
  mUsage.mockResolvedValue({ mediaKits: 0, pitches: 0 });
  mRl.mockResolvedValue({ success: true, remaining: 11 } as never);
  mGen.mockResolvedValue({ pitchId: 'p1', subject: 'Collab', body: 'Hi', proposedRatePaise: 1800000, deliverables: ['reel'] });
});

describe('POST /api/deals/pitch', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST(req({ brandId: 'b1' })))).status).toBe(401);
  });

  it('400 when brandId is missing', async () => {
    const { status, body } = await readJson(await POST(req({})));
    expect(status).toBe(400);
    expect((body as { code: string }).code).toBe('bad_request');
  });

  it('402 limit_reached when the monthly pitch quota is used up (free: 3)', async () => {
    mPlan.mockResolvedValue('free');
    mUsage.mockResolvedValue({ mediaKits: 0, pitches: 3 });
    const { status, body } = await readJson(await POST(req({ brandId: 'b1' })));
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('limit_reached');
    expect(mGen).not.toHaveBeenCalled();
  });

  it('404 when the brand is not found', async () => {
    mGen.mockRejectedValue(new NoBrandError());
    expect((await readJson(await POST(req({ brandId: 'ghost' })))).status).toBe(404);
  });

  it('409 no_profile when the creator has no stats', async () => {
    mGen.mockRejectedValue(new NoProfileError());
    const { status, body } = await readJson(await POST(req({ brandId: 'b1' })));
    expect(status).toBe(409);
    expect((body as { code: string }).code).toBe('no_profile');
  });

  it('200 returns the pitch and passes normalized deliverables', async () => {
    const { status, body } = await readJson(await POST(req({ brandId: 'b1', deliverables: ['story', 'bad'] })));
    expect(status).toBe(200);
    expect((body as { pitchId: string }).pitchId).toBe('p1');
    expect(mGen).toHaveBeenCalledWith('user-1', 'b1', ['story']);
  });
});
