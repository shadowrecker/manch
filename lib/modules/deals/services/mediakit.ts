import { createAdminClient } from '@/lib/supabase/admin';
import { incrementUsage } from '@/lib/db/queries';
import { getCreatorProfile, getLatestMetrics } from '@/lib/modules/deals/queries';
import { composeMediaKit } from '@/lib/modules/deals/ai/prompts/mediakit';
import { captureServer, EVENTS } from '@/lib/analytics';
import { randomId } from '@/lib/utils';
import { log } from '@/lib/observability';
import type { IgMetrics, MediaKitData } from '@/lib/modules/deals/types';
import type { IgMetricsRow, Json } from '@/lib/db/types';

export class NoMetricsError extends Error {
  constructor() {
    super('No metrics — connect Instagram or enter stats first');
    this.name = 'NoMetricsError';
  }
}

export interface MediaKitResult {
  kitId: string;
  shareId: string;
  data: MediaKitData;
  metrics: IgMetrics;
}

function toMetrics(row: IgMetricsRow): IgMetrics {
  return {
    followers: row.followers,
    engagementRate: row.engagement_rate,
    avgLikes: row.avg_likes,
    avgComments: row.avg_comments,
    topCategories: (row.top_categories as string[] | null) ?? [],
    audience: (row.audience as IgMetrics['audience']) ?? null,
  };
}

/** Compose + persist a media kit from the creator's latest metric snapshot. */
export async function generateMediaKitForUser(userId: string): Promise<MediaKitResult> {
  const [metricsRow, profile] = await Promise.all([getLatestMetrics(userId), getCreatorProfile(userId)]);
  if (!metricsRow) throw new NoMetricsError();
  const metrics = toMetrics(metricsRow);

  const data = await composeMediaKit({
    followers: metrics.followers,
    engagementRate: metrics.engagementRate,
    niche: profile?.niche ?? [],
    contentStyle: profile?.content_style ?? null,
    city: profile?.city ?? null,
    topCategories: metrics.topCategories,
  });

  const kitId = crypto.randomUUID();
  const shareId = randomId(10);
  const sb = createAdminClient();
  // Store the kit content + the metric snapshot together so the public share
  // page is self-contained.
  const { error } = await sb.from('media_kits').insert({
    id: kitId,
    user_id: userId,
    data: { kit: data, metrics } as unknown as Json,
    share_id: shareId,
    ai_labelled: true,
  });
  if (error) throw error;

  try {
    await incrementUsage(userId, 'media_kits', 1);
  } catch (e) {
    log.warn('media-kit metering failed (kit created)', { kitId, error: String(e) });
  }
  await captureServer(EVENTS.mediaKitGenerated, userId, {});

  return { kitId, shareId, data, metrics };
}
