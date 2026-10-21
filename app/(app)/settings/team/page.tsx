import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getPlan, getProfile } from '@/lib/db/queries';
import { PLAN_LABEL } from '@/lib/plans';
import { loadTeamBundle } from '@/lib/modules/post/team';
import { TeamClient, CreateTeamForm } from '@/components/post/TeamClient';

// Team-lite settings page (PRD §1; F-07). Server component:
//  - Non-Team plan -> upsell card linking to billing.
//  - Team plan, no team yet -> create-team form.
//  - Team plan with a team -> full TeamClient.
// All team data is loaded server-side via loadTeamBundle (admin client) with
// ownership/membership resolved there.
export default async function TeamSettingsPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const plan = await getPlan(user.id);

  // Entitlement gate: Team plan only.
  if (plan !== 'team') {
    return (
      <div className="card">
        <h1>Team workspace</h1>
        <p className="sub">
          Invite up to 10 teammates and share one brand voice. Available on the Team plan.
        </p>
        <div className="empty">
          <p className="muted">
            You&apos;re on the <b>{PLAN_LABEL[plan]}</b> plan. Upgrade to Team to create a workspace and invite
            members.
          </p>
          <Link className="btn" href="/settings/billing?plan=team" style={{ marginTop: 12 }}>
            Upgrade to Team
          </Link>
        </div>
      </div>
    );
  }

  const profile = await getProfile(user.id);

  // Team plan but not on a team yet — let them create one.
  if (!profile?.team_id) {
    return <CreateTeamForm />;
  }

  const bundle = await loadTeamBundle(profile.team_id, user.id);
  if (!bundle?.team) {
    // team_id points at a missing team (shouldn't happen) — fall back to create.
    return <CreateTeamForm />;
  }

  return (
    <TeamClient
      team={bundle.team}
      members={bundle.members}
      invites={bundle.invites}
      seats={bundle.team.seats}
      isOwner={bundle.isOwner}
    />
  );
}
