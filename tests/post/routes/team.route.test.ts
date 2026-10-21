import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeChain } from '../helpers/mocks';

// Route-handler tests for /api/team (GET read bundle, POST create team).
// Mock every spine dependency the route imports, then call the exported handler
// with a Request and assert on the Response. vi.mock factories are hoisted, so
// declare them before importing the route.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getProfile: vi.fn() }));
vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));
vi.mock('@/lib/modules/post/team', () => ({
  loadTeamBundle: vi.fn(),
  EMPTY_TEAM_BUNDLE: {
    team: null,
    members: [],
    invites: [],
    seatsUsed: 0,
    isOwner: false,
  },
  DEFAULT_TEAM_SEATS: 10,
}));

import { GET, POST } from '@/app/api/team/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/db/queries';
import { loadTeamBundle } from '@/lib/modules/post/team';

const mUser = vi.mocked(getUser);
const mAdmin = vi.mocked(createAdminClient);
const mProfile = vi.mocked(getProfile);
const mBundle = vi.mocked(loadTeamBundle);

function req(body?: unknown) {
  return jsonRequest('http://test/api/team', body);
}

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mProfile.mockResolvedValue({ id: 'user-1', plan: 'team', team_id: null } as never);
});

describe('GET /api/team', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('returns the empty bundle when the profile has no team_id', async () => {
    mProfile.mockResolvedValue({ id: 'user-1', plan: 'team', team_id: null } as never);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body).toMatchObject({ team: null, members: [], invites: [], seatsUsed: 0, isOwner: false });
    expect(mBundle).not.toHaveBeenCalled();
  });

  it('returns the empty bundle when there is no profile at all', async () => {
    mProfile.mockResolvedValue(null as never);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect((body as { team: unknown }).team).toBeNull();
    expect(mBundle).not.toHaveBeenCalled();
  });

  it('returns the full bundle when team_id is present', async () => {
    mProfile.mockResolvedValue({ id: 'user-1', plan: 'team', team_id: 'team-9' } as never);
    const fullBundle = {
      team: { id: 'team-9', name: 'Acme', owner_id: 'user-1', seats: 10 },
      members: [{ id: 'user-1', full_name: 'Owner', headline: null, is_owner: true }],
      invites: [],
      seatsUsed: 1,
      isOwner: true,
    };
    mBundle.mockResolvedValue(fullBundle as never);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(mBundle).toHaveBeenCalledWith('team-9', 'user-1');
    expect(body).toMatchObject({ seatsUsed: 1, isOwner: true });
    expect((body as { team: { id: string } }).team.id).toBe('team-9');
  });

  it('404 when the team_id resolves to no bundle', async () => {
    mProfile.mockResolvedValue({ id: 'user-1', plan: 'team', team_id: 'team-gone' } as never);
    mBundle.mockResolvedValue(null as never);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('team_not_found');
  });
});

describe('POST /api/team', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    const { status, body } = await readJson(await POST(req({ name: 'Acme' })));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('403 team_plan_required when plan is not team', async () => {
    mProfile.mockResolvedValue({ id: 'user-1', plan: 'pro', team_id: null } as never);
    const { status, body } = await readJson(await POST(req({ name: 'Acme' })));
    expect(status).toBe(403);
    expect((body as { error: string }).error).toBe('team_plan_required');
    expect(mAdmin).not.toHaveBeenCalled();
  });

  it('403 when there is no profile', async () => {
    mProfile.mockResolvedValue(null as never);
    const { status, body } = await readJson(await POST(req({ name: 'Acme' })));
    expect(status).toBe(403);
    expect((body as { error: string }).error).toBe('team_plan_required');
  });

  it('409 already_on_a_team when the team-plan user already has a team_id', async () => {
    mProfile.mockResolvedValue({ id: 'user-1', plan: 'team', team_id: 'team-existing' } as never);
    const { status, body } = await readJson(await POST(req({ name: 'Acme' })));
    expect(status).toBe(409);
    expect((body as { error: string }).error).toBe('already_on_a_team');
    expect(mAdmin).not.toHaveBeenCalled();
  });

  it('400 invalid_json on a malformed body', async () => {
    const bad = new Request('http://test/api/team', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const { status, body } = await readJson(await POST(bad));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_json');
  });

  it('400 name_required when name is missing', async () => {
    const { status, body } = await readJson(await POST(req({})));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('name_required');
  });

  it('400 name_required when name is whitespace only', async () => {
    const { status, body } = await readJson(await POST(req({ name: '   ' })));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('name_required');
  });

  it('creates the team, attaches the owner, and returns the team', async () => {
    const team = { id: 'team-new', name: 'Acme', owner_id: 'user-1', seats: 10 };
    const teamsChain = makeChain({ data: team, error: null });
    const profilesChain = makeChain({ data: null, error: null });
    const sb = {
      from: vi.fn((t: string) => (t === 'teams' ? teamsChain : profilesChain)),
    };
    mAdmin.mockReturnValue(sb as never);

    const { status, body } = await readJson(await POST(req({ name: '  Acme  ' })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect((body as { team: { id: string } }).team.id).toBe('team-new');

    // Inserted into teams with trimmed name, owner_id, and the default seats.
    expect(teamsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme', owner_id: 'user-1', seats: 10 }),
    );
    // Owner attached: profiles updated with the new team id, scoped to the user.
    expect(profilesChain.update).toHaveBeenCalledWith(expect.objectContaining({ team_id: 'team-new' }));
    expect(profilesChain.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('500 could_not_create_team when the team insert errors', async () => {
    const teamsChain = makeChain({ data: null, error: { message: 'db down' } });
    const sb = { from: vi.fn(() => teamsChain) };
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ name: 'Acme' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('could_not_create_team');
  });

  it('500 and rolls back the team when attaching the owner fails', async () => {
    const team = { id: 'team-new', name: 'Acme', owner_id: 'user-1', seats: 10 };
    const teamsChain = makeChain({ data: team, error: null });
    const profilesChain = makeChain({ data: null, error: { message: 'attach failed' } });
    const sb = {
      from: vi.fn((t: string) => (t === 'teams' ? teamsChain : profilesChain)),
    };
    mAdmin.mockReturnValue(sb as never);

    const { status, body } = await readJson(await POST(req({ name: 'Acme' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('could_not_create_team');
    // Best-effort rollback: the orphaned team is deleted.
    expect(teamsChain.delete).toHaveBeenCalled();
    expect(teamsChain.eq).toHaveBeenCalledWith('id', 'team-new');
  });
});
