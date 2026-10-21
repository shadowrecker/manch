import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getProfile } from '@/lib/db/queries';
import { getLatestMetrics, getLatestMediaKit } from '@/lib/modules/deals/queries';
import { MediaKitClient } from '@/components/deals/MediaKitClient';
import { env } from '@/lib/env';
import type { IgMetrics, MediaKitData } from '@/lib/modules/deals/types';
import type { IgMetricsRow } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

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

export default async function MediaKitPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [profile, metricsRow, kitRow] = await Promise.all([
    getProfile(user.id),
    getLatestMetrics(user.id),
    getLatestMediaKit(user.id),
  ]);

  const metrics = metricsRow ? toMetrics(metricsRow) : null;
  const stored = (kitRow?.data as { kit?: MediaKitData; metrics?: IgMetrics } | null) ?? null;

  return (
    <MediaKitClient
      appUrl={env.appUrl}
      name={profile?.full_name ?? null}
      metrics={stored?.metrics ?? metrics}
      kit={stored?.kit ?? null}
      shareId={kitRow?.share_id ?? null}
    />
  );
}
