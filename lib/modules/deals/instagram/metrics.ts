import { createAdminClient } from '@/lib/supabase/admin';
import { fetchMetrics } from '@/lib/modules/deals/instagram/graph';
import { followerBand } from '@/lib/modules/deals/utils';
import type { IgMetrics } from '@/lib/modules/deals/types';
import type { Database, Json } from '@/lib/db/types';

// Metric snapshots are written ONLY here (service-role); clients can't fake stats.
// Two sources: live Instagram Graph, or manual entry (Meta-review fallback).

export async function snapshotMetrics(
  userId: string,
  m: IgMetrics,
  source: 'instagram' | 'manual',
): Promise<void> {
  const sb = createAdminClient();
  await sb.from('ig_metrics').insert({
    user_id: userId,
    followers: m.followers,
    engagement_rate: m.engagementRate,
    avg_likes: m.avgLikes,
    avg_comments: m.avgComments,
    top_categories: (m.topCategories ?? []) as Json,
    audience: (m.audience ?? null) as Json,
    source,
  });
  await sb
    .from('creator_profiles')
    .upsert({ user_id: userId, follower_band: followerBand(m.followers) }, { onConflict: 'user_id' });
}

/** Pull live metrics for a connected creator and snapshot them. */
export async function fetchAndSnapshot(userId: string): Promise<void> {
  const sb = createAdminClient();
  const { data: conn } = await sb
    .from('instagram_connections')
    .select('access_token, ig_user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!conn?.access_token || !conn.ig_user_id) throw new Error('no instagram connection');
  const m = await fetchMetrics(conn.access_token, conn.ig_user_id);
  await snapshotMetrics(userId, m, 'instagram');
}

export interface ManualMetricsInput {
  followers?: number;
  engagementRate?: number;
  avgLikes?: number;
  avgComments?: number;
  topCategories?: string[];
  niche?: string[];
  contentStyle?: string;
  city?: string;
  primaryLanguage?: string;
}

/** The Meta-review fallback: a creator enters their own stats + profile. */
export async function manualMetrics(userId: string, input: ManualMetricsInput): Promise<void> {
  await snapshotMetrics(
    userId,
    {
      followers: input.followers ?? null,
      engagementRate: input.engagementRate ?? null,
      avgLikes: input.avgLikes ?? null,
      avgComments: input.avgComments ?? null,
      topCategories: input.topCategories ?? [],
      audience: null,
    },
    'manual',
  );

  const sb = createAdminClient();
  const patch: Database['public']['Tables']['creator_profiles']['Insert'] = {
    user_id: userId,
    follower_band: followerBand(input.followers),
  };
  if (input.niche) patch.niche = input.niche;
  if (input.contentStyle) patch.content_style = input.contentStyle;
  if (input.city) patch.city = input.city;
  if (input.primaryLanguage) patch.primary_language = input.primaryLanguage;
  await sb.from('creator_profiles').upsert(patch, { onConflict: 'user_id' });
}
