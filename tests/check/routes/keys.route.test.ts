import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeSupabase, makeChain } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { apiKeyIssued: 'api_key_issued' } }));

import { DELETE, POST } from '@/app/api/check/keys/route';
import { getPlan } from '@/lib/db/queries';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const mUser = vi.mocked(getUser);

let keys: ReturnType<typeof makeChain>;

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  vi.mocked(getPlan).mockResolvedValue('newsroom');
  keys = makeChain({ data: { id: 'k1' }, error: null });
  vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { api_keys: keys } }) as never);
});

describe('POST /api/check/keys', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST(jsonRequest('http://t/api/check/keys', { orgName: 'X' })))).status).toBe(401);
  });

  it('400 when orgName is missing', async () => {
    expect((await readJson(await POST(jsonRequest('http://t/api/check/keys', {})))).status).toBe(400);
  });

  it('200 issues a raw key ONCE with the id + quota', async () => {
    const { status, body } = await readJson(await POST(jsonRequest('http://t/api/check/keys', { orgName: 'Daily Herald' })));
    expect(status).toBe(200);
    const b = body as { id: string; key: string; monthly_quota: number };
    expect(b.id).toBe('k1');
    expect(b.key).toMatch(/^tck_/);
    expect(b.monthly_quota).toBeGreaterThan(0);
  });

  it('403 for accounts without an API plan (free / consumer plans)', async () => {
    for (const plan of ['free', 'plus', 'pro'] as const) {
      vi.mocked(getPlan).mockResolvedValue(plan);
      const { status, body } = await readJson(await POST(jsonRequest('http://t/api/check/keys', { orgName: 'X' })));
      expect(status).toBe(403);
      expect((body as { code: string }).code).toBe('plan_required');
    }
    expect(keys.insert).not.toHaveBeenCalled();
  });

  it('records the issuing account as the key owner', async () => {
    await POST(jsonRequest('http://t/api/check/keys', { orgName: 'Daily Herald' }));
    expect(keys.insert).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 'user-1', org_name: 'Daily Herald' }));
  });
});

describe('DELETE /api/check/keys', () => {
  const del = (q = '?id=k1') => new Request(`http://t/api/check/keys${q}`, { method: 'DELETE' });

  it('401 / 400 guards', async () => {
    mUser.mockResolvedValue(null);
    expect((await DELETE(del())).status).toBe(401);
    mUser.mockResolvedValue(fakeUser() as never);
    expect((await DELETE(del(''))).status).toBe(400);
  });

  it('revokes only a key the caller owns', async () => {
    expect((await DELETE(del())).status).toBe(200);
    expect(keys.update).toHaveBeenCalledWith({ active: false });
    expect(keys.eq).toHaveBeenCalledWith('owner_id', 'user-1');
  });

  it("404 for someone else's key (no cross-account revoke)", async () => {
    keys = makeChain({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { api_keys: keys } }) as never);
    expect((await DELETE(del('?id=other'))).status).toBe(404);
  });
});
