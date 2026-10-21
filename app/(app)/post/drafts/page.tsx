import { redirect } from 'next/navigation';
import { createClient, getUser } from '@/lib/supabase/server';
import { getPlan, getProfile } from '@/lib/db/queries';
import { DraftsClient } from '@/components/post/DraftsClient';
import type { DraftRow } from '@/lib/db/types';

// Drafts list page (PRD F-05). Server component: loads the user's plan + profile
// for the editor preview, and their non-discarded drafts (newest first) via the
// RLS-scoped client. Hands everything to the client component for interaction.
export default async function DraftsPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [plan, profile] = await Promise.all([getPlan(user.id), getProfile(user.id)]);

  const supabase = createClient();
  const { data } = await supabase
    .from('drafts')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'discarded')
    .order('created_at', { ascending: false });

  const drafts: DraftRow[] = data ?? [];

  return (
    <section>
      <div className="card">
        <h1>My Drafts</h1>
        <p className="sub">
          Edit, preview and schedule. Scheduling to LinkedIn is gated to paid tiers.
        </p>
        <DraftsClient
          drafts={drafts}
          plan={plan}
          authorName={profile?.full_name ?? null}
          headline={profile?.headline ?? null}
        />
      </div>
    </section>
  );
}
