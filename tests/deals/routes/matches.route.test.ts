import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/deals/match/engine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/deals/match/engine')>('@/lib/modules/deals/match/engine');
  return { runMatch: vi.fn(), NoProfileError: actual.NoProfileError, EmbeddingsUnavailableError: actual.EmbeddingsUnavailableError };
});

import { POST } from '@/app/api/deals/matches/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { rateLimit } from '@/lib/ratelimit';
import { runMatch, NoProfileError, EmbeddingsUnavailableError } from '@/lib/modules/deals/match/engine';

const mUser = vi.mocked(getUser);
const mPlan = vi.mocked(getPlan);
const mRl = vi.mocked(rateLimit);
const mRun = vi.mocked(runMatch);

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mPlan.mockResolvedValue('plus');
  mRl.mockResolvedValue({ success: true, remaining: 5 } as never);
  mRun.mockResolvedValue([{ brandId: 'b1', name: 'Slurrp Farm', fitScore: 88, reasons: ['niche fit'], website: 'https://x', niche: ['food'] }]);
});

describe('POST /api/deals/matches', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST())).status).toBe(401);
  });

  it('402 upgrade_required on the free plan', async () => {
    mPlan.mockResolvedValue('free');
    const { status, body } = await readJson(await POST());
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('upgrade_required');
    expect(mRun).not.toHaveBeenCalled();
  });

  it('429 when rate limited', async () => {
    mRl.mockResolvedValue({ success: false, remaining: 0 } as never);
    expect((await readJson(await POST())).status).toBe(429);
  });

  it('409 no_profile when the creator has no stats yet', async () => {
    mRun.mockRejectedValue(new NoProfileError());
    const { status, body } = await readJson(await POST());
    expect(status).toBe(409);
    expect((body as { code: string }).code).toBe('no_profile');
  });

  it('503 when embeddings are unavailable', async () => {
    mRun.mockRejectedValue(new EmbeddingsUnavailableError());
    expect((await readJson(await POST())).status).toBe(503);
  });

  it('200 returns ranked matches on a paid plan', async () => {
    const { status, body } = await readJson(await POST());
    expect(status).toBe(200);
    expect((body as { matches: { brandId: string }[] }).matches[0].brandId).toBe('b1');
    expect(mRun).toHaveBeenCalledWith('user-1');
  });

  it('500 on an unexpected failure', async () => {
    mRun.mockRejectedValue(new Error('rpc down'));
    expect((await readJson(await POST())).status).toBe(500);
  });
});
