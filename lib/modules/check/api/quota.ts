import { createAdminClient } from '@/lib/supabase/admin';
import { monthPeriod } from '@/lib/utils';

// API-key monthly metering (PRD §27 newsroom: 10,000 calls/month). Counts the
// key's checks this calendar month against its quota.

export async function countApiChecks(apiKeyId: string): Promise<number> {
  const sb = createAdminClient();
  const monthStart = `${monthPeriod()}T00:00:00Z`;
  const { count } = await sb
    .from('checks')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('created_at', monthStart);
  return count ?? 0;
}

export interface ApiQuotaState {
  used: number;
  limit: number;
  exceeded: boolean;
}

export async function apiQuota(apiKeyId: string, monthlyQuota: number): Promise<ApiQuotaState> {
  const used = await countApiChecks(apiKeyId);
  return { used, limit: monthlyQuota, exceeded: used >= monthlyQuota };
}
