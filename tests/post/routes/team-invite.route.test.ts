import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeChain } from '../helpers/mocks';

// Route-handler tests for /api/team/invite (POST create invite, DELETE revoke).
// Ownership + seat logic is server-authoritative; the route recomputes seat
// usage (members + pending invites) before issuing a new invite.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getProfile: vi.fn() }));
vi.mock('@/lib/modules/post/email/resend', () => ({ sendInviteEmail: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  EVENTS: { teamInviteSent: 'team_invite_sent', teamSeatAccepted: 'team_seat_accepted' },
  captureServer: vi.fn(),
}));
vi.mock('@/lib/utils', () => ({ randomId: vi.fn(() => 'tok-fixed-123') }));
vi.mock('@/lib/env', () => ({ env: { appUrl: 'https://manch.test' } }));
vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { POST, DELETE } from '@/app/api/team/invite/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/db/queries';
import { sendInviteEmail } from '@/lib/modules/post/email/resend';
import { captureServer } from '@/lib/analytics';

const mUser = vi.mocked(getUser);
const mAdmin = vi.mocked(createAdminClient);
const mProfile = vi.mocked(getProfile);
const mEmail = vi.mocked(sendInviteEmail);
const mCapture = vi.mocked(captureServer);

function req(body?: unknown) {
  return jsonRequest('http://test/api/team/invite', body);
}
function delReq(body?: unknown) {
  return jsonRequest('http://test/api/team/invite', body, { method: 'DELETE' });
}

// A chain that resolves differently for an awaited count vs. terminal lookups.
function countChain(count: number) {
  const c = makeChain({ count } as never);
  return c;
}

const TEAM = { id: 'team-9', name: 'Acme', owner_id: 'user-1', seats: 10 };

/**
 * Build a fake admin client for the POST happy-path family.
 *   - teams: maybeSingle -> the owned team
 *   - profiles: awaited count chain -> memberCount
 *   - team_invites: used for (a) awaited pending count, (b) maybeSingle dup check,
 *     (c) single insert. We hand back a fresh chain per call so each terminal
 *     resolves independently.
 */
function makePostSb(opts: {
  team?: unknown;
  memberCount?: number;
  pendingCount?: number;
  existingInvite?: unknown;
  insert?: { data?: unknown; error?: unknown };
}) {
  const team = opts.team ?? TEAM;
  const teamsChain = makeChain({ data: team } as never);
  const profilesChain = countChain(opts.memberCount ?? 0);

  const pendingCountChain = countChain(opts.pendingCount ?? 0);
  const dupChain = makeChain({ data: opts.existingInvite ?? null } as never);
  const insertChain = makeChain(
    opts.insert ?? { data: { id: 'inv-1', token: 'tok-fixed-123', email: 'new@x.com' }, error: null },
  );
  // team_invites is hit 3 times in order: count, dup check, insert.
  const inviteCalls = [pendingCountChain, dupChain, insertChain];
  let i = 0;

  const sb = {
    from: vi.fn((t: string) => {
      if (t === 'teams') return teamsChain;
      if (t === 'profiles') return profilesChain;
      if (t === 'team_invites') return inviteCalls[Math.min(i++, inviteCalls.length - 1)];
      return makeChain();
    }),
  };
  return { sb, teamsChain, insertChain, dupChain };
}

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mProfile.mockResolvedValue({ id: 'user-1', team_id: 'team-9' } as never);
  mEmail.mockResolvedValue(undefined as never);
  mCapture.mockResolvedValue(undefined as never);
});

describe('POST /api/team/invite', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    const { status, body } = await readJson(await POST(req({ email: 'a@b.com' })));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('400 invalid_json on a malformed body', async () => {
    const bad = new Request('http://test/api/team/invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    const { status, body } = await readJson(await POST(bad));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_json');
  });

  it('400 invalid_email when the email is malformed', async () => {
    const { status, body } = await readJson(await POST(req({ email: 'not-an-email' })));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_email');
  });

  it('400 invalid_email when email is missing', async () => {
    const { status, body } = await readJson(await POST(req({})));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_email');
  });

  it('404 no_team when the caller has no team_id', async () => {
    mProfile.mockResolvedValue({ id: 'user-1', team_id: null } as never);
    mAdmin.mockReturnValue(makePostSb({}).sb as never);
    const { status, body } = await readJson(await POST(req({ email: 'a@b.com' })));
    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('no_team');
  });

  it('404 team_not_found when the team row is missing', async () => {
    const teamsChain = makeChain({ data: null } as never);
    const sb = { from: vi.fn(() => teamsChain) };
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ email: 'a@b.com' })));
    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('team_not_found');
  });

  it('403 not_team_owner when the caller does not own the team', async () => {
    const { sb } = makePostSb({ team: { ...TEAM, owner_id: 'someone-else' } });
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ email: 'a@b.com' })));
    expect(status).toBe(403);
    expect((body as { error: string }).error).toBe('not_team_owner');
  });

  it('409 no_seats_available when members + pending invites fill the seats', async () => {
    const { sb } = makePostSb({ memberCount: 7, pendingCount: 3 }); // 10 >= seats(10)
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ email: 'a@b.com' })));
    expect(status).toBe(409);
    expect((body as { error: string }).error).toBe('no_seats_available');
    expect(mEmail).not.toHaveBeenCalled();
  });

  it('409 already_invited when a pending invite for that email exists', async () => {
    const { sb } = makePostSb({ memberCount: 1, existingInvite: { id: 'inv-existing' } });
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ email: 'a@b.com' })));
    expect(status).toBe(409);
    expect((body as { error: string }).error).toBe('already_invited');
    expect(mEmail).not.toHaveBeenCalled();
  });

  it('500 could_not_create_invite when the insert errors', async () => {
    const { sb } = makePostSb({ memberCount: 1, insert: { data: null, error: { message: 'x' } } });
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await POST(req({ email: 'a@b.com' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('could_not_create_invite');
  });

  it('creates a pending invite, emails the link, captures the event, returns token', async () => {
    const invite = { id: 'inv-1', team_id: 'team-9', email: 'new@x.com', token: 'tok-fixed-123', status: 'pending' };
    const { sb, insertChain } = makePostSb({ memberCount: 1, insert: { data: invite, error: null } });
    mAdmin.mockReturnValue(sb as never);

    const { status, body } = await readJson(await POST(req({ email: '  NEW@X.com ' })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, token: 'tok-fixed-123' });
    expect((body as { invite: { id: string } }).invite.id).toBe('inv-1');

    // Inserted a pending invite with the lowercased/trimmed email + generated token.
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: 'team-9', email: 'new@x.com', token: 'tok-fixed-123', status: 'pending' }),
    );
    // Accept link emailed to the invitee with the env appUrl + token.
    expect(mEmail).toHaveBeenCalledWith('new@x.com', 'https://manch.test/settings/team/accept?token=tok-fixed-123');
    // team_invite_sent captured for the owner with the team id.
    expect(mCapture).toHaveBeenCalledWith('team_invite_sent', 'user-1', { team_id: 'team-9' });
  });
});

describe('DELETE /api/team/invite (revoke)', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    const { status, body } = await readJson(await DELETE(delReq({ inviteId: 'inv-1' })));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('400 invalid_json on a malformed body', async () => {
    const bad = new Request('http://test/api/team/invite', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    const { status, body } = await readJson(await DELETE(bad));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_json');
  });

  it('400 inviteId_required when no invite id is given', async () => {
    const { status, body } = await readJson(await DELETE(delReq({})));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('inviteId_required');
  });

  it('403 not_team_owner when the caller does not own the team', async () => {
    const teamsChain = makeChain({ data: { ...TEAM, owner_id: 'other' } } as never);
    const sb = { from: vi.fn(() => teamsChain) };
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await DELETE(delReq({ inviteId: 'inv-1' })));
    expect(status).toBe(403);
    expect((body as { error: string }).error).toBe('not_team_owner');
  });

  it('404 invite_not_found when no pending invite matched', async () => {
    const teamsChain = makeChain({ data: TEAM } as never);
    const updateChain = makeChain({ data: null, error: null });
    const sb = {
      from: vi.fn((t: string) => (t === 'teams' ? teamsChain : updateChain)),
    };
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await DELETE(delReq({ inviteId: 'inv-x' })));
    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('invite_not_found');
  });

  it('500 could_not_revoke when the update errors', async () => {
    const teamsChain = makeChain({ data: TEAM } as never);
    const updateChain = makeChain({ data: null, error: { message: 'boom' } });
    const sb = {
      from: vi.fn((t: string) => (t === 'teams' ? teamsChain : updateChain)),
    };
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await DELETE(delReq({ inviteId: 'inv-1' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('could_not_revoke');
  });

  it('revokes a pending invite scoped to the owner team', async () => {
    const teamsChain = makeChain({ data: TEAM } as never);
    const updateChain = makeChain({ data: { id: 'inv-1' }, error: null });
    const sb = {
      from: vi.fn((t: string) => (t === 'teams' ? teamsChain : updateChain)),
    };
    mAdmin.mockReturnValue(sb as never);
    const { status, body } = await readJson(await DELETE(delReq({ inviteId: 'inv-1' })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }));
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'inv-1');
    expect(updateChain.eq).toHaveBeenCalledWith('team_id', 'team-9');
    expect(updateChain.eq).toHaveBeenCalledWith('status', 'pending');
  });
});
