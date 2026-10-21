import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAndSnapshot } from '@/lib/modules/deals/instagram/metrics';
import { log } from '@/lib/observability';

// Periodic IG metric refresh (PRD §8.4 cron). Re-pulls stats for connected
// accounts so media kits / matches / rates stay current. Manual-entry creators
// (no instagram_connection) are untouched.

export interface RefreshSummary {
  total: number;
  refreshed: number;
  failed: number;
}

export async function refreshConnectedMetrics(limit = 100): Promise<RefreshSummary> {
  const sb = createAdminClient();
  const { data } = await sb.from('instagram_connections').select('user_id').limit(limit);
  const userIds = ((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id);

  let refreshed = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      await fetchAndSnapshot(userId);
      refreshed++;
    } catch (e) {
      failed++;
      log.warn('metrics refresh failed for user', { userId, error: String(e) });
    }
  }

  log.info('metrics refresh complete', { total: userIds.length, refreshed, failed });
  return { total: userIds.length, refreshed, failed };
}
