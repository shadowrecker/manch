import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/db/queries';
import { EVENTS, captureServer } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';

// POST /api/team/accept — the invited (signed-in) user accepts a seat.
// Body: { token }. We look up the pending invite, verify seat capacity, attach
// the accepting user's profile to the team, and mark the invite accepted.

interface AcceptBody {
  token?: unknown;
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: AcceptBody;
  try {
    body = (await req.json()) as AcceptBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return NextResponse.json({ error: 'token_required' }, { status: 400 });

  const sb = createAdminClient();

  const { data: invite } = await sb
    .from('team_invites')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle();
  if (!invite) {
    return NextResponse.json({ error: 'invite_invalid_or_used' }, { status: 404 });
  }

  // If the user is already on a team, don't silently move them.
  const profile = await getProfile(user.id);
  if (profile?.team_id && profile.team_id !== invite.team_id) {
    return NextResponse.json({ error: 'already_on_a_team' }, { status: 409 });
  }

  const { data: team } = await sb
    .from('teams')
    .select('*')
    .eq('id', invite.team_id)
    .maybeSingle();
  if (!team) {
    return NextResponse.json({ error: 'team_not_found' }, { status: 404 });
  }

  // Guard seat capacity: count current members (the accepting user is not yet
  // attached) against the cap.
  const { count: memberCount } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', team.id);
  if ((memberCount ?? 0) >= team.seats) {
    return NextResponse.json({ error: 'team_full' }, { status: 409 });
  }

  // Attach the user, then mark the invite accepted.
  const { error: attachError } = await sb
    .from('profiles')
    .update({ team_id: team.id })
    .eq('id', user.id);
  if (attachError) {
    captureException(attachError, { where: 'acceptInviteAttach', userId: user.id });
    return NextResponse.json({ error: 'could_not_accept' }, { status: 500 });
  }

  const { error: markError } = await sb
    .from('team_invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);
  if (markError) {
    // Membership already applied; log but report success to the user.
    captureException(markError, { where: 'acceptInviteMark', userId: user.id });
  }

  await captureServer(EVENTS.teamSeatAccepted, user.id, { team_id: team.id });
  log.info('team seat accepted', { userId: user.id, teamId: team.id });

  return NextResponse.json({ ok: true, team_id: team.id });
}
