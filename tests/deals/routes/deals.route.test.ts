import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/modules/deals/services/deals', () => ({ createDeal: vi.fn(), listDeals: vi.fn() }));

import { POST, GET } from '@/app/api/deals/pipeline/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { createDeal, listDeals } from '@/lib/modules/deals/services/deals';

const mUser = vi.mocked(getUser);
const mPlan = vi.mocked(getPlan);
const mCreate = vi.mocked(createDeal);
const mList = vi.mocked(listDeals);

const req = (b: unknown) => jsonRequest('http://test/api/deals/pipeline', b);

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mPlan.mockResolvedValue('plus');
  mCreate.mockResolvedValue({ id: 'd1', brand_name: 'Mamaearth', value_paise: 2500000, status: 'pitched', commission_status: 'none', commission_paise: null } as never);
  mList.mockResolvedValue([{ id: 'd1' }] as never);
});

describe('POST /api/deals/pipeline', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST(req({ brandName: 'X' })))).status).toBe(401);
  });

  it('402 upgrade_required on the free plan', async () => {
    mPlan.mockResolvedValue('free');
    const { status, body } = await readJson(await POST(req({ brandName: 'X' })));
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('upgrade_required');
    expect(mCreate).not.toHaveBeenCalled();
  });

  it('200 creates a deal and converts rupees → paise', async () => {
    const { status } = await readJson(await POST(req({ brandName: 'Mamaearth', valueRupees: 25000 })));
    expect(status).toBe(200);
    expect(mCreate.mock.calls[0][1].valuePaise).toBe(2500000);
  });
});

describe('GET /api/deals/pipeline', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('200 lists the creator deals', async () => {
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect((body as { deals: unknown[] }).deals).toHaveLength(1);
  });
});
