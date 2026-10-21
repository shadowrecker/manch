import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { AcceptInvite } from '@/components/post/AcceptInvite';

// Landing page for team invite emails (/settings/team/accept?token=…). The
// (app) layout already auth-guards; the client card posts the token to
// /api/team/accept.
export default async function AcceptTeamInvitePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const user = await getUser();
  if (!user) redirect('/login');

  return <AcceptInvite token={typeof searchParams.token === 'string' ? searchParams.token : ''} />;
}
