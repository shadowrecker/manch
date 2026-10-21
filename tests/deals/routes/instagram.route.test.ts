import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/modules/deals/instagram/metrics', () => ({ manualMetrics: vi.fn() }));
vi.mock('@/lib/modules/deals/instagram/oauth', () => ({ authUrl: vi.fn(() => 'https://www.instagram.com/oauth/authorize?x=1'), INSTAGRAM_STATE_COOKIE: 'ig_oauth_state' }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }) }));

import { POST as manualPOST } from '@/app/api/deals/instagram/manual/route';
import { GET as connectGET } from '@/app/api/deals/instagram/connect/route';
import { getUser } from '@/lib/supabase/server';
import { manualMetrics } from '@/lib/modules/deals/instagram/metrics';

const mUser = vi.mocked(getUser);
const req = (b: unknown) => jsonRequest('http://test/api/deals/instagram/manual', b);

beforeEach(() => mUser.mockResolvedValue(fakeUser() as never));

describe('POST /api/deals/instagram/manual', () => {
  it('401 unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await manualPOST(req({ followers: 1000 })))).status).toBe(401);
  });
  it('400 when followers missing/invalid', async () => {
    expect((await readJson(await manualPOST(req({ niche: ['food'] })))).status).toBe(400);
  });
  it('200 snapshots manual metrics', async () => {
    const { status } = await readJson(await manualPOST(req({ followers: 8000, niche: ['food'], contentStyle: 'fun' })));
    expect(status).toBe(200);
    expect(manualMetrics).toHaveBeenCalledWith('user-1', expect.objectContaining({ followers: 8000, niche: ['food'] }));
  });
});

describe('GET /api/deals/instagram/connect', () => {
  it('401 unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await connectGET()).status).toBe(401);
  });
  it('redirects to the Instagram authorize URL', async () => {
    const res = await connectGET();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/instagram\.com\/oauth\/authorize/);
  });
});
