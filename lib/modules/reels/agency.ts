import { createAdminClient } from '@/lib/supabase/admin';
import { TIER_LIMITS } from '@/lib/modules/reels/entitlements';

// Agency-lite team provisioning (PRD §1 scope decision). A Team-plan user (Reels
// "agency" tier) gets a team lazily on their first brand preset; presets are
// team-scoped. Teams are the shared core table, so a team already created for
// Post seats is reused as-is.

export async function getUserTeamId(userId: string): Promise<string | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('profiles').select('team_id').eq('id', userId).maybeSingle();
  return data?.team_id ?? null;
}

export async function ensureTeam(userId: string, name = 'My Agency'): Promise<string> {
  const existing = await getUserTeamId(userId);
  if (existing) return existing;
  const sb = createAdminClient();
  const { data: team, error } = await sb
    .from('teams')
    .insert({ name, owner_id: userId, seats: TIER_LIMITS.agency.teamSeats })
    .select('id')
    .single();
  if (error || !team) throw error ?? new Error('could not create team');
  await sb.from('profiles').update({ team_id: team.id }).eq('id', userId);
  return team.id;
}
