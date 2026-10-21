import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { canRate } from '@/lib/modules/deals/entitlements';
import { getRateCard } from '@/lib/modules/deals/services/rates';
import { RatesClient } from '@/components/deals/RatesClient';

export const dynamic = 'force-dynamic';

export default async function RatesPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [plan, card] = await Promise.all([getPlan(user.id), getRateCard(user.id)]);

  return <RatesClient canRate={canRate(plan)} card={card} />;
}
