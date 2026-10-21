import { createAdminClient } from '@/lib/supabase/admin';
import { monthPeriod } from '@/lib/utils';
import { normalisePlan, type Plan } from '@/lib/plans';
import type { ProfileRow, UsageMetric } from '@/lib/db/types';

// Shared, server-only account + metering queries used by every module. All use
// the service-role client and are safe only inside server code. Module-specific
// queries live in lib/modules/<m>/queries.ts.

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

/** The account's Manch plan (unknown/missing → free). */
export async function getPlan(userId: string): Promise<Plan> {
  const profile = await getProfile(userId);
  return normalisePlan(profile?.plan);
}

/** Resolve an app user from a linked WhatsApp number (E.164). */
export async function getProfileByWhatsapp(e164: string): Promise<ProfileRow | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('profiles').select('*').eq('whatsapp_e164', e164).maybeSingle();
  return data;
}

/** This month's count for one metered action. */
export async function getUsage(userId: string, metric: UsageMetric): Promise<number> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('usage_counters')
    .select('used')
    .eq('user_id', userId)
    .eq('period', monthPeriod())
    .eq('metric', metric)
    .maybeSingle();
  return data?.used ?? 0;
}

/** Atomically increment this month's counter for one metric. Returns the new total. */
export async function incrementUsage(userId: string, metric: UsageMetric, by = 1): Promise<number> {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc('increment_usage', {
    p_user_id: userId,
    p_period: monthPeriod(),
    p_metric: metric,
    p_by: by,
  });
  if (error) throw error;
  return data ?? 0;
}
