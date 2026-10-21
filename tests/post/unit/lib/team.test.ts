import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '@/tests/post/helpers/mocks';

// Team helpers read across users (members + pending invites) via the
// service-role admin client, which we mock. loadTeamBundle queries three
// tables: teams, profiles, team_invites — we hand each its own chain.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadTeamBundle,
  EMPTY_TEAM_BUNDLE,
  DEFAULT_TEAM_SEATS,
} from '@/lib/modules/post/team';

const mAdmin = vi.mocked(createAdminClient);

function useSupabase(opts: Parameters<typeof makeSupabase>[0] = {}) {
  const sb = makeSupabase(opts);
  mAdmin.mockReturnValue(sb as never);
  return sb;
}

beforeEach(() => {
  mAdmin.mockReset();
});

describe('constants', () => {
  it('DEFAULT_TEAM_SEATS is 10 (team plan seats)', () => {
    expect(DEFAULT_TEAM_SEATS).toBe(10);
  });

  it('EMPTY_TEAM_BUNDLE has the expected empty shape', () => {
    expect(EMPTY_TEAM_BUNDLE).toEqual({
      team: null,
      members: [],
      invites: [],
      seatsUsed: 0,
      isOwner: false,
    });
  });
});

describe('loadTeamBundle', () => {
  it('returns null when the team row is missing', async () => {
    const sb = useSupabase({ tables: { teams: makeChain({ data: null, error: null }) } });

    const result = await loadTeamBundle('team-1', 'user-1');

    expect(result).toBeNull();
    expect(sb.from).toHaveBeenCalledWith('teams');
  });

  it('builds members with correct is_owner and counts seats from members + invites', async () => {
    const team = { id: 'team-1', owner_id: 'owner-1' };
    const memberRows = [
      { id: 'owner-1', full_name: 'Owner', headline: 'CEO', team_id: 'team-1' },
      { id: 'member-2', full_name: 'Member Two', headline: null, team_id: 'team-1' },
    ];
    const invites = [
      { id: 'inv-1', team_id: 'team-1', status: 'pending', email: 'a@x.com' },
      { id: 'inv-2', team_id: 'team-1', status: 'pending', email: 'b@x.com' },
      { id: 'inv-3', team_id: 'team-1', status: 'pending', email: 'c@x.com' },
    ];

    const teamsChain = makeChain({ data: team, error: null });
    const profilesChain = makeChain({ data: memberRows, error: null });
    const invitesChain = makeChain({ data: invites, error: null });
    const sb = useSupabase({
      tables: { teams: teamsChain, profiles: profilesChain, team_invites: invitesChain },
    });

    const result = await loadTeamBundle('team-1', 'owner-1');

    expect(result).not.toBeNull();
    expect(result!.team).toEqual(team);
    expect(result!.members).toEqual([
      { id: 'owner-1', full_name: 'Owner', headline: 'CEO', is_owner: true },
      { id: 'member-2', full_name: 'Member Two', headline: null, is_owner: false },
    ]);
    expect(result!.invites).toEqual(invites);
    // seatsUsed = members (2) + pending invites (3)
    expect(result!.seatsUsed).toBe(5);

    // Verify the queries were scoped correctly.
    expect(sb.from).toHaveBeenCalledWith('teams');
    expect(sb.from).toHaveBeenCalledWith('profiles');
    expect(sb.from).toHaveBeenCalledWith('team_invites');
    expect(profilesChain.eq).toHaveBeenCalledWith('team_id', 'team-1');
    expect(profilesChain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(invitesChain.eq).toHaveBeenCalledWith('team_id', 'team-1');
    expect(invitesChain.eq).toHaveBeenCalledWith('status', 'pending');
    expect(invitesChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('isOwner is true only when viewerId matches team.owner_id', async () => {
    const team = { id: 'team-1', owner_id: 'owner-1' };
    useSupabase({
      tables: {
        teams: makeChain({ data: team, error: null }),
        profiles: makeChain({ data: [], error: null }),
        team_invites: makeChain({ data: [], error: null }),
      },
    });

    const asOwner = await loadTeamBundle('team-1', 'owner-1');
    expect(asOwner!.isOwner).toBe(true);
  });

  it('isOwner is false for a non-owner viewer', async () => {
    const team = { id: 'team-1', owner_id: 'owner-1' };
    useSupabase({
      tables: {
        teams: makeChain({ data: team, error: null }),
        profiles: makeChain({ data: [], error: null }),
        team_invites: makeChain({ data: [], error: null }),
      },
    });

    const asMember = await loadTeamBundle('team-1', 'member-2');
    expect(asMember!.isOwner).toBe(false);
  });

  it('handles null member and invite rows as empty (seatsUsed 0, empty arrays)', async () => {
    const team = { id: 'team-1', owner_id: 'owner-1' };
    useSupabase({
      tables: {
        teams: makeChain({ data: team, error: null }),
        profiles: makeChain({ data: null, error: null }),
        team_invites: makeChain({ data: null, error: null }),
      },
    });

    const result = await loadTeamBundle('team-1', 'owner-1');

    expect(result!.members).toEqual([]);
    expect(result!.invites).toEqual([]);
    expect(result!.seatsUsed).toBe(0);
  });

  it('counts seats from members only when there are no pending invites', async () => {
    const team = { id: 'team-1', owner_id: 'owner-1' };
    const memberRows = [
      { id: 'owner-1', full_name: 'Owner', headline: null },
      { id: 'm-2', full_name: 'Two', headline: null },
      { id: 'm-3', full_name: 'Three', headline: null },
    ];
    useSupabase({
      tables: {
        teams: makeChain({ data: team, error: null }),
        profiles: makeChain({ data: memberRows, error: null }),
        team_invites: makeChain({ data: [], error: null }),
      },
    });

    const result = await loadTeamBundle('team-1', 'owner-1');
    expect(result!.seatsUsed).toBe(3);
  });
});
