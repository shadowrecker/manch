import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { getBrandMatches } from '@/lib/modules/deals/queries';
import { canMatch } from '@/lib/modules/deals/entitlements';
import { MatchesClient } from '@/components/deals/MatchesClient';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [plan, matches] = await Promise.all([getPlan(user.id), getBrandMatches(user.id)]);

  return <MatchesClient canMatch={canMatch(plan)} initialMatches={matches} />;
}
