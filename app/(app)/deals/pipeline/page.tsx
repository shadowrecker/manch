import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { canTrackDeals } from '@/lib/modules/deals/entitlements';
import { listDeals } from '@/lib/modules/deals/services/deals';
import { DealsClient } from '@/components/deals/DealsClient';
import { commissionPaise } from '@/lib/modules/deals/types';
import type { DealView } from '@/components/deals/DealsClient';

// /deals/pipeline — the deal tracker (formerly CreatorStack's /deals).
export const dynamic = 'force-dynamic';

export default async function DealsPipelinePage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [plan, deals] = await Promise.all([getPlan(user.id), listDeals(user.id)]);

  const views: DealView[] = deals.map((d) => ({
    id: d.id,
    brandName: d.brand_name,
    title: d.title,
    valuePaise: d.value_paise,
    status: d.status,
    commissionStatus: d.commission_status,
    commissionPaise: d.commission_paise ?? (d.value_paise ? commissionPaise(d.value_paise) : null),
  }));

  return <DealsClient canTrackDeals={canTrackDeals(plan)} initialDeals={views} />;
}
