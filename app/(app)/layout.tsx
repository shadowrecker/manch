import { redirect } from 'next/navigation';
import { createClient, getUser } from '@/lib/supabase/server';
import { Nav } from '@/components/Nav';
import { ModuleFrame } from '@/components/ModuleFrame';
import { normalisePlan } from '@/lib/plans';

// Authed shell for every module. Guards every (app) route, loads the user's
// plan for the badge, and renders the shared nav inside the module frame.
// Forced dynamic: per-user pages must never be prerendered or cached, even
// when a build runs without Supabase env.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login');

  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, full_name')
    .eq('id', user.id)
    .maybeSingle();
  const account = {
    name: profile?.full_name ?? null,
    email: user.email ?? user.phone ?? null,
    plan: normalisePlan(profile?.plan),
  };

  return (
    <ModuleFrame>
      <Nav account={account} />
      <main className="wrap">{children}</main>
    </ModuleFrame>
  );
}
