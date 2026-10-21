import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/db/queries';
import { EVENTS, captureServer } from '@/lib/analytics';
import { sendInviteEmail } from '@/lib/modules/post/email/resend';
import { env } from '@/lib/env';
import { randomId } from '@/lib/utils';
import { log, captureException } from '@/lib/observability';
import type { Database, TeamRow } from '@/lib/db/types';

// /api/team/invite — owner-only seat invites.
//   POST   { email }     -> create a pending invite (if a seat is free) + email it
//   DELETE { inviteId }  -> revoke a pending invite (frees the seat)
//
// All checks are server-authoritative: the caller must own the team, and we
// recompute seat usage (members + pending invites) before issuing a new one.

interface InviteBody {
  email?: unknown;
}
interface RevokeBody {
  inviteId?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Discriminated union so call sites narrow cleanly on `ok`.
type OwnedTeam =
  | { ok: false; response: NextResponse }
  | { ok: true; sb: SupabaseClient<Database>; team: TeamRow };

/**
 * Resolve the team owned by the signed-in user. Returns the admin client + team
 * row, or an error response. Only owners may manage invites.
 */
async function requireOwnedTeam(userId: string): Promise<OwnedTeam> {
  const profile = await getProfile(userId);
  if (!profile?.team_id) {
    return { ok: false, response: NextResponse.json({ error: 'no_team' }, { status: 404 }) };
  }

  const sb = createAdminClient();
  const { data: team } = await sb
    .from('teams')
    .select('*')
    .eq('id', profile.team_id)
    .maybeSingle();
  if (!team) {
    return { ok: false, response: NextResponse.json({ error: 'team_not_found' }, { status: 404 }) };
  }
  if (team.owner_id !== userId) {
    return { ok: false, response: NextResponse.json({ error: 'not_team_owner' }, { status: 403 }) };
  }

  return { ok: true, sb, team };
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const owned = await requireOwnedTeam(user.id);
  if (!owned.ok) return owned.response;
  const { sb, team } = owned;

  // Count current members + pending invites against the seat cap.
  const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact', head: true }).eq('team_id', team.id),
    sb
      .from('team_invites')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team.id)
      .eq('status', 'pending'),
  ]);
  const used = (memberCount ?? 0) + (pendingCount ?? 0);
  if (used >= team.seats) {
    return NextResponse.json({ error: 'no_seats_available' }, { status: 409 });
  }

  // Avoid duplicate pending invites for the same email on this team.
  const { data: existing } = await sb
    .from('team_invites')
    .select('id')
    .eq('team_id', team.id)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'already_invited' }, { status: 409 });
  }

  const token = randomId(24);
  const { data: invite, error: insertError } = await sb
    .from('team_invites')
    .insert({ team_id: team.id, email, token, status: 'pending' })
    .select('*')
    .single();
  if (insertError || !invite) {
    captureException(insertError, { where: 'createInvite', userId: user.id });
    return NextResponse.json({ error: 'could_not_create_invite' }, { status: 500 });
  }

  // Email the accept link. sendInviteEmail never throws, so a missing key or a
  // delivery hiccup won't fail the invite — the token is also returned for the
  // owner to share manually.
  const inviteUrl = `${env.appUrl}/settings/team/accept?token=${token}`;
  await sendInviteEmail(email, inviteUrl);

  await captureServer(EVENTS.teamInviteSent, user.id, { team_id: team.id });
  log.info('team invite sent', { userId: user.id, teamId: team.id });

  return NextResponse.json({ ok: true, token, invite });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: RevokeBody;
  try {
    body = (await req.json()) as RevokeBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const inviteId = typeof body.inviteId === 'string' ? body.inviteId : '';
  if (!inviteId) return NextResponse.json({ error: 'inviteId_required' }, { status: 400 });

  const owned = await requireOwnedTeam(user.id);
  if (!owned.ok) return owned.response;
  const { sb, team } = owned;

  // Scope the update to this owner's team so an owner can only revoke their own
  // team's pending invites.
  const { data: updated, error: updateError } = await sb
    .from('team_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('team_id', team.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (updateError) {
    captureException(updateError, { where: 'revokeInvite', userId: user.id });
    return NextResponse.json({ error: 'could_not_revoke' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'invite_not_found' }, { status: 404 });
  }

  log.info('team invite revoked', { userId: user.id, teamId: team.id, inviteId });
  return NextResponse.json({ ok: true });
}
