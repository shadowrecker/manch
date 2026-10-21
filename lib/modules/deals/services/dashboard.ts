import { getPlan } from '@/lib/db/queries';
import { getMonthlyUsage, getLatestMetrics, getLatestMediaKit, getBrandMatches } from '@/lib/modules/deals/queries';
import { listDeals } from '@/lib/modules/deals/services/deals';
import type { Plan } from '@/lib/plans';

// The creator home summary (PRD §7 dashboard): wedge status + money loop at a glance.

export interface DashboardData {
  plan: Plan;
  usage: { mediaKits: number; pitches: number };
  hasMetrics: boolean;
  followers: number | null;
  engagementRate: number | null;
  kitShareId: string | null;
  matchesCount: number;
  topMatch: { name: string; fitScore: number } | null;
  deals: {
    total: number;
    pending: number;
    collected: number;
    gmvPaise: number;
    commissionPaise: number;
  };
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const [plan, usage, metrics, kit, matches, deals] = await Promise.all([
    getPlan(userId),
    getMonthlyUsage(userId),
    getLatestMetrics(userId),
    getLatestMediaKit(userId),
    getBrandMatches(userId),
    listDeals(userId),
  ]);

  let pending = 0;
  let collected = 0;
  let gmvPaise = 0;
  let commissionPaise = 0;
  for (const d of deals) {
    if (d.commission_status === 'pending') pending++;
    if (d.commission_status === 'collected') {
      collected++;
      gmvPaise += d.value_paise ?? 0;
      commissionPaise += d.commission_paise ?? 0;
    }
  }

  return {
    plan,
    usage: { mediaKits: usage.mediaKits, pitches: usage.pitches },
    hasMetrics: !!metrics,
    followers: metrics?.followers ?? null,
    engagementRate: metrics?.engagement_rate ?? null,
    kitShareId: kit?.share_id ?? null,
    matchesCount: matches.length,
    topMatch: matches[0] ? { name: matches[0].name, fitScore: matches[0].fitScore } : null,
    deals: { total: deals.length, pending, collected, gmvPaise, commissionPaise },
  };
}
