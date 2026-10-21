import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/deals/services/deals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/deals/services/deals')>('@/lib/modules/deals/services/deals');
  return { generateDealPayment: vi.fn(), NoDealError: actual.NoDealError, NoValueError: actual.NoValueError };
});

import { POST } from '@/app/api/deals/pipeline/[id]/payment/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { rateLimit } from '@/lib/ratelimit';
import { generateDealPayment, NoDealError, NoValueError } from '@/lib/modules/deals/services/deals';

const mUser = vi.mocked(getUser);
const mPlan = vi.mocked(getPlan);
const mRl = vi.mocked(rateLimit);
const mGen = vi.mocked(generateDealPayment);
const ctx = { params: { id: 'd1' } };
const call = () => POST(new Request('http://test/api/deals/pipeline/d1/payment', { method: 'POST' }), ctx);

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mPlan.mockResolvedValue('plus');
  mRl.mockResolvedValue({ success: true, remaining: 5 } as never);
  mGen.mockResolvedValue({ url: 'https://rzp.io/i/x', routed: true, needsKyc: false, commissionPaise: 125000, creatorPaise: 2375000 });
});

describe('POST /api/deals/pipeline/[id]/payment', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await call())).status).toBe(401);
  });

  it('402 on the free plan', async () => {
    mPlan.mockResolvedValue('free');
    expect((await readJson(await call())).status).toBe(402);
  });

  it('404 when the deal is missing', async () => {
    mGen.mockRejectedValue(new NoDealError());
    expect((await readJson(await call())).status).toBe(404);
  });

  it('409 no_value when the deal has no value', async () => {
    mGen.mockRejectedValue(new NoValueError());
    const { status, body } = await readJson(await call());
    expect(status).toBe(409);
    expect((body as { code: string }).code).toBe('no_value');
  });

  it('200 returns the payment link', async () => {
    const { status, body } = await readJson(await call());
    expect(status).toBe(200);
    expect((body as { url: string }).url).toBe('https://rzp.io/i/x');
  });
});
