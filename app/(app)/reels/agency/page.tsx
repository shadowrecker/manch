import Link from 'next/link';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { getUserTeamId } from '@/lib/modules/reels/agency';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAgency } from '@/lib/modules/reels/entitlements';
import { tierForPlan } from '@/lib/pricing';
import { AgencyClient } from '@/components/reels/AgencyClient';
import type { BrandPresetRow } from '@/lib/db/types';

export default async function AgencyPage() {
  const user = await getUser();
  const plan = user ? await getPlan(user.id) : 'free';

  if (!canAgency(plan)) {
    const team = tierForPlan('team');
    return (
      <div className="card">
        <h1>Agency</h1>
        <p className="sub">
          Brand presets, bulk mode and white-label export are on the Manch {team.name} plan ({team.priceMonthly}/mo)
          — the fastest path to ₹1L MRR for a 10-client shop.
        </p>
        <Link href="/settings/billing?plan=team" className="btn">
          See the {team.name} plan →
        </Link>
      </div>
    );
  }

  let presets: BrandPresetRow[] = [];
  const teamId = user ? await getUserTeamId(user.id) : null;
  if (teamId) {
    const { data } = await createAdminClient()
      .from('brand_presets')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    presets = data ?? [];
  }
  return <AgencyClient initialPresets={presets} />;
}
