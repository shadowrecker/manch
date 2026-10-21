import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeChain } from '../helpers/mocks';

// Route-handler tests for POST /api/team/accept. The invited (signed-in) user
// supplies { token }; we look up the pending invite, guard seat capacity, attach
// the user's profile to the team, mark the invite accepted, and capture an event.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getProfile: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  EVENTS: { teamInviteSent: 'team_invite_sent', teamSeatAccepted: 'team_seat_accepted' },
  captureServer: vi.fn(),
}));
vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { POST } from '@/app/api/team/accept/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/db/queries';
import { captureServer } from '@/lib/analytics';

const mUser = vi.mocked(getUser);
const mAdmin = vi.mocked(createAdminClient);
const mProfile = vi.mocked(getProfile);
const mCapture = vi.mocked(captureServer);

function req(body?: unknown) {
  return jsonRequest('http://test/api/team/accept', body);
}

const INVITE = { id: 'inv-1', team_id: 'team-9', email: 'new@x.com', token: 'tok-1', status: 'pending' };
const TEAM = { id: 'team-9', name: 'Acme', owner_id: 'owner-1', seats: 10 };

/** Resolve a chain to a count via the awaited `.then`. */
function countChain(count: number) {
  return makeChain({ count } as never);
}

/**
 * Build the admin client for the accept flow.
 *   - team_invites: maybeSingle (invite lookup), then update (mark accepted)
 *   - teams: maybeSingle (team lookup)
 *   - profiles: awaited count chain (member count), then update (attach)
 */
function makeSb(opts: {
  invite?: unknown;
  team?: unknown;
  memberCount?: number;
  attachError?: unknown;
  markError?: unknown;
}) {
  const inviteLookup = makeChain({ data: opts.invite === undefined ? INVITE : opts.invite } as never);
  const inviteMark = makeChain({ data: { id: 'inv-1' }, error: opts.markError ?? null });
  const inviteCalls = [inviteLookup, inviteMark];
  let inviteIdx = 0;

  const teamsChain = makeChain({ data: opts.team === undefined ? TEAM : opts.team } as never);

  const profileCount = countChain(opts.memberCount ?? 0);
  const profileAttach = makeChain({ data: null, error: opts.attachError ?? null });
  const profileCalls = [profileCount, profileAttach];
  let profileIdx = 0;

  const sb = {
    from: vi.fn((t: string) => {
      if (t === 'team_invites') return inviteCalls[Math.min(inviteIdx++, inviteCalls.length - 1)];
      if (t === 'teams') return teamsChain;
      if (t === 'profiles') return profileCalls[Math.min(profileIdx++, profileCalls.length - 1)];
      return makeChain();
    }),
  };
  return { sb, inviteMark, profileAttach };
}

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  // By default the accepting user is not yet on any team.
  mProfile.mockResolvedValue({ id: 'user-1', team_id: null } as never);
  mCapture.mockResolvedValue(undefined as never);
});

describe('POST /api/team/accept', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    const { status, body } = await readJson(await POST(req({ token: 'tok-1' })));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('400 invalid_json on a malformed body', async () => {
    const bad = new Request('http://test/api/team/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    const { status, body } = await readJson(await POST(bad));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_json');
  });

  it('400 token_required when no token given', async () => {
    const { status, body } = await readJson(await POST(req({})));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('token_required');
  });

  it('400 token_required when token is whitespace only', async () => {
    const { status, body } = await readJson(await POST(req({ token: '   ' })));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('token_required');
  });

  it('404 invite_invalid_or_used when no pending invite matches the token', async () => {
    const { sb } = makeSb({ invite: null });
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ token: 'gone' })));
    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('invite_invalid_or_used');
  });

  it('409 already_on_a_team when the user is already on a different team', async () => {
    mProfile.mockResolvedValue({ id: 'user-1', team_id: 'team-other' } as never);
    const { sb } = makeSb({});
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ token: 'tok-1' })));
    expect(status).toBe(409);
    expect((body as { error: string }).error).toBe('already_on_a_team');
  });

  it('404 team_not_found when the invited team row is missing', async () => {
    const { sb } = makeSb({ team: null });
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ token: 'tok-1' })));
    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('team_not_found');
  });

  it('409 team_full when current members already fill the seats', async () => {
    const { sb } = makeSb({ memberCount: 10 }); // 10 >= seats(10)
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ token: 'tok-1' })));
    expect(status).toBe(409);
    expect((body as { error: string }).error).toBe('team_full');
    expect(mCapture).not.toHaveBeenCalled();
  });

  it('500 could_not_accept when attaching the user fails', async () => {
    const { sb } = makeSb({ memberCount: 1, attachError: { message: 'attach failed' } });
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ token: 'tok-1' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('could_not_accept');
    expect(mCapture).not.toHaveBeenCalled();
  });

  it('attaches the user, marks the invite accepted, captures the event', async () => {
    const { sb, profileAttach, inviteMark } = makeSb({ memberCount: 2 });
    mAdmin.mockReturnValue(sb as never);

    const { status, body } = await readJson(await POST(req({ token: '  tok-1 ' })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, team_id: 'team-9' });

    // Profile attached to the team, scoped to the accepting user.
    expect(profileAttach.update).toHaveBeenCalledWith(expect.objectContaining({ team_id: 'team-9' }));
    expect(profileAttach.eq).toHaveBeenCalledWith('id', 'user-1');
    // Invite marked accepted.
    expect(inviteMark.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
    expect(inviteMark.eq).toHaveBeenCalledWith('id', 'inv-1');
    // team_seat_accepted captured for the accepting user.
    expect(mCapture).toHaveBeenCalledWith('team_seat_accepted', 'user-1', { team_id: 'team-9' });
  });

  it('still reports success when marking the invite accepted fails (membership applied)', async () => {
    const { sb } = makeSb({ memberCount: 2, markError: { message: 'mark failed' } });
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ token: 'tok-1' })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, team_id: 'team-9' });
    expect(mCapture).toHaveBeenCalledWith('team_seat_accepted', 'user-1', { team_id: 'team-9' });
  });

  it('allows re-accepting when the user is already on the invited team', async () => {
    mProfile.mockResolvedValue({ id: 'user-1', team_id: 'team-9' } as never);
    const { sb } = makeSb({ memberCount: 2 });
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ token: 'tok-1' })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, team_id: 'team-9' });
  });
});
