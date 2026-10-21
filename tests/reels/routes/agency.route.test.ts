import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeSupabase, makeChain } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/modules/reels/agency', () => ({ ensureTeam: vi.fn(), getUserTeamId: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { agencyBrandPresetCreated: 'agency_brand_preset_created' } }));

import { GET, POST } from '@/app/api/reels/agency/brands/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { ensureTeam, getUserTeamId } from '@/lib/modules/reels/agency';
import { createAdminClient } from '@/lib/supabase/admin';

const mUser = vi.mocked(getUser);
const req = (b: unknown) => jsonRequest('http://test/api/reels/agency/brands', b);

let presetChain: ReturnType<typeof makeChain>;

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  vi.mocked(getPlan).mockResolvedValue('team');
  vi.mocked(ensureTeam).mockResolvedValue('team-1');
  vi.mocked(getUserTeamId).mockResolvedValue('team-1');
  presetChain = makeChain({ data: { id: 'bp1', name: 'Sharma Sweets', default_languages: ['hi'] }, error: null });
  vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { brand_presets: presetChain } }) as never);
});

describe('POST /api/reels/agency/brands', () => {
  it('401 unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST(req({ name: 'X' })))).status).toBe(401);
  });
  it('403 when not on the Team plan (Reels agency tier)', async () => {
    vi.mocked(getPlan).mockResolvedValue('pro');
    const { status, body } = await readJson(await POST(req({ name: 'X' })));
    expect(status).toBe(403);
    expect((body as { code: string }).code).toBe('upgrade');
  });
  it('400 when name is missing', async () => {
    expect((await readJson(await POST(req({ brief: 'x' })))).status).toBe(400);
  });
  it('creates a brand preset (ensures a team, filters valid languages)', async () => {
    const { status, body } = await readJson(await POST(req({ name: 'Sharma Sweets', languages: ['hi', 'zz', 'ta'] })));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(ensureTeam).toHaveBeenCalledWith('user-1');
    const row = presetChain.insert.mock.calls[0][0] as { team_id: string; default_languages: string[] };
    expect(row.team_id).toBe('team-1');
    expect(row.default_languages).toEqual(['hi', 'ta']); // 'zz' filtered out
  });
});

describe('GET /api/reels/agency/brands', () => {
  it('401 unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await GET())).status).toBe(401);
  });
  it('returns [] when the user has no team', async () => {
    vi.mocked(getUserTeamId).mockResolvedValue(null);
    const { body } = await readJson(await GET());
    expect((body as { presets: unknown[] }).presets).toEqual([]);
  });
});
