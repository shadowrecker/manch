import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/db/queries';
import { log, captureException } from '@/lib/observability';
import { loadTeamBundle, EMPTY_TEAM_BUNDLE, DEFAULT_TEAM_SEATS } from '@/lib/modules/post/team';

// /api/team — read the caller's team bundle (GET) and create a team (POST).
//
// Team data spans multiple users (members, pending invites), so reads/writes use
// the service-role client and we enforce ownership/membership in code. Mutations
// require the caller to be the team owner; never trust the client.

// GET /api/team — the caller's team + members + pending invites, or empty bundle.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const profile = await getProfile(user.id);
  if (!profile?.team_id) {
    return NextResponse.json(EMPTY_TEAM_BUNDLE);
  }

  const bundle = await loadTeamBundle(profile.team_id, user.id);
  if (!bundle) {
    return NextResponse.json({ error: 'team_not_found' }, { status: 404 });
  }
  return NextResponse.json(bundle);
}

interface CreateBody {
  name?: unknown;
}

// POST /api/team — create a team (Team plan only) and attach the owner to it.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const profile = await getProfile(user.id);
  // Server-authoritative entitlement: only Team-plan users may own a team.
  if (profile?.plan !== 'team') {
    return NextResponse.json({ error: 'team_plan_required' }, { status: 403 });
  }
  if (profile.team_id) {
    return NextResponse.json({ error: 'already_on_a_team' }, { status: 409 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });

  const sb = createAdminClient();

  const { data: team, error: teamError } = await sb
    .from('teams')
    .insert({ name, owner_id: user.id, seats: DEFAULT_TEAM_SEATS })
    .select('*')
    .single();
  if (teamError || !team) {
    captureException(teamError, { where: 'createTeam', userId: user.id });
    return NextResponse.json({ error: 'could_not_create_team' }, { status: 500 });
  }

  // Attach the owner to the new team. Best-effort rollback if this fails so we
  // don't leave an orphaned team with no members.
  const { error: attachError } = await sb
    .from('profiles')
    .update({ team_id: team.id })
    .eq('id', user.id);
  if (attachError) {
    captureException(attachError, { where: 'attachOwnerToTeam', userId: user.id });
    await sb.from('teams').delete().eq('id', team.id);
    return NextResponse.json({ error: 'could_not_create_team' }, { status: 500 });
  }

  log.info('team created', { userId: user.id, teamId: team.id });
  return NextResponse.json({ ok: true, team });
}
