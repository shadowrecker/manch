import { createAdminClient } from '@/lib/supabase/admin';
import { planLimits } from '@/lib/modules/post/entitlements';
import type { TeamRow, ProfileRow, TeamInviteRow } from '@/lib/db/types';

// Team data helpers (teams are shared across Manch — Post Team / Reels Agency —
// and owned by the Post module). Team data spans multiple users (members,
// pending invites), so reads use the service-role client and callers enforce
// ownership/membership. Lives in lib/ (not a route file) so both the API route
// and the team page can import it.

export const DEFAULT_TEAM_SEATS = planLimits('team').teamSeats; // 10

export interface TeamMember {
  id: string;
  full_name: string | null;
  headline: string | null;
  is_owner: boolean;
}

export interface TeamBundle {
  team: TeamRow | null;
  members: TeamMember[];
  invites: TeamInviteRow[];
  seatsUsed: number;
  isOwner: boolean;
}

export const EMPTY_TEAM_BUNDLE: TeamBundle = {
  team: null,
  members: [],
  invites: [],
  seatsUsed: 0,
  isOwner: false,
};

/** Load the full team bundle for a given team using the admin client. */
export async function loadTeamBundle(teamId: string, viewerId: string): Promise<TeamBundle | null> {
  const sb = createAdminClient();

  const { data: team } = await sb.from('teams').select('*').eq('id', teamId).maybeSingle();
  if (!team) return null;

  const { data: memberRows } = await sb
    .from('profiles')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true });

  const members: TeamMember[] = (memberRows ?? []).map((m: ProfileRow) => ({
    id: m.id,
    full_name: m.full_name,
    headline: m.headline,
    is_owner: m.id === team.owner_id,
  }));

  const { data: invites } = await sb
    .from('team_invites')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return {
    team,
    members,
    invites: invites ?? [],
    // A pending invite holds a seat until accepted or revoked.
    seatsUsed: members.length + (invites?.length ?? 0),
    isOwner: team.owner_id === viewerId,
  };
}
