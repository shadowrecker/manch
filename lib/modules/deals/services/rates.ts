import { createAdminClient } from '@/lib/supabase/admin';
import { getCreatorProfile, getLatestMetrics } from '@/lib/modules/deals/queries';
import { rateRationale } from '@/lib/modules/deals/ai/prompts/rate';
import type { Deliverable, FollowerBand, RateBenchmark } from '@/lib/modules/deals/types';
import type { RateBenchmarkRow } from '@/lib/db/types';

const DELIVERABLE_ORDER: Deliverable[] = ['reel', 'story', 'post', 'bundle'];
const DEFAULT_REGION = 'IN';

export interface RateCard {
  niche: string;
  band: FollowerBand;
  region: string;
  rates: RateBenchmark[];
  suggestedRatePaise: number | null;
}

function toBenchmark(row: RateBenchmarkRow): RateBenchmark {
  return {
    deliverable: row.deliverable as Deliverable,
    p25Paise: row.p25_paise,
    p50Paise: row.p50_paise,
    p75Paise: row.p75_paise,
    sampleSize: row.sample_size,
  };
}

/** Look up benchmark rows for a (niche, band) across deliverables, region-aware. */
export async function lookupRates(niche: string, band: string, region = DEFAULT_REGION): Promise<RateBenchmark[]> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('rate_benchmarks')
    .select('*')
    .eq('niche', niche)
    .eq('follower_band', band)
    .or(`region.eq.${region},region.is.null`);

  const rows = (data as RateBenchmarkRow[] | null) ?? [];
  return rows
    .map(toBenchmark)
    .sort((a, b) => DELIVERABLE_ORDER.indexOf(a.deliverable) - DELIVERABLE_ORDER.indexOf(b.deliverable));
}

/** The creator's rate card from their profile's niche + follower band. */
export async function getRateCard(userId: string): Promise<RateCard | null> {
  const profile = await getCreatorProfile(userId);
  if (!profile) return null;

  const niche = (profile.niche?.[0] ?? 'general').toLowerCase();
  const band = (profile.follower_band ?? 'micro') as FollowerBand;
  const rates = await lookupRates(niche, band);

  const reel = rates.find((r) => r.deliverable === 'reel');
  const suggested = reel?.p50Paise ?? rates.find((r) => r.p50Paise != null)?.p50Paise ?? null;

  return { niche, band, region: DEFAULT_REGION, rates, suggestedRatePaise: suggested };
}

/** Rate card + a Claude negotiation rationale (one paragraph, benchmark-grounded). */
export async function getRateCardWithRationale(userId: string): Promise<(RateCard & { rationale: string | null }) | null> {
  const card = await getRateCard(userId);
  if (!card) return null;
  if (card.rates.length === 0) return { ...card, rationale: null };

  const [profile, metrics] = await Promise.all([getCreatorProfile(userId), getLatestMetrics(userId)]);
  const rationale = await rateRationale({
    niche: card.niche,
    band: card.band,
    city: profile?.city ?? null,
    engagementRate: metrics?.engagement_rate ?? null,
    rates: card.rates,
  });
  return { ...card, rationale };
}
