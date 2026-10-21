import { createAdminClient } from '@/lib/supabase/admin';
import { monthPeriod } from '@/lib/utils';
import { getProfile } from '@/lib/db/queries';
import { normalisePlan, type Plan } from '@/lib/plans';
import type { BotUserRow, CheckRow } from '@/lib/db/types';

// Server-only Check queries (service-role): WhatsApp bot users, checks and the
// per-bot-user monthly check meter (`check_usage`). Account-level queries
// (getProfile, getPlan, getProfileByWhatsapp) live in the shared core:
// @/lib/db/queries.

/** The WhatsApp bot user for a wa_id, or null. */
export async function getBotUserByWaId(waId: string): Promise<BotUserRow | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('bot_users').select('*').eq('wa_id', waId).maybeSingle();
  return data;
}

/** Get-or-create the bot user for a wa_id (first contact creates the row). */
export async function getOrCreateBotUser(waId: string): Promise<BotUserRow> {
  const existing = await getBotUserByWaId(waId);
  if (existing) return existing;
  const sb = createAdminClient();
  const { data, error } = await sb.from('bot_users').insert({ wa_id: waId }).select('*').single();
  if (error) throw error;
  return data;
}

/**
 * Link a bot user to a Manch account (bot_users.user_id) so the account's checks
 * show on /check/history and the account's plan applies on WhatsApp.
 */
export async function linkBotUser(botUserId: string, userId: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('bot_users').update({ user_id: userId }).eq('id', botUserId);
  if (error) throw error;
}

/**
 * The Manch plan that governs a bot user's Check entitlements: the linked
 * account's plan when the WhatsApp number belongs to a Manch account, otherwise
 * the bot user's own `plan` column (Manch plan names, default 'free').
 */
export async function planForBotUser(botUser: Pick<BotUserRow, 'user_id' | 'plan'>): Promise<Plan> {
  if (botUser.user_id) {
    const profile = await getProfile(botUser.user_id);
    if (profile) return normalisePlan(profile.plan);
  }
  return normalisePlan(botUser.plan);
}

/** Recent checks for a signed-in user (via their linked WhatsApp bot users). */
export async function getRecentChecksForUser(userId: string, limit = 20): Promise<CheckRow[]> {
  const sb = createAdminClient();
  const { data: bots } = await sb.from('bot_users').select('id').eq('user_id', userId);
  const ids = (bots ?? []).map((b) => b.id);
  if (!ids.length) return [];
  const { data } = await sb
    .from('checks')
    .select('*')
    .in('bot_user_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as CheckRow[] | null) ?? [];
}

/** This month's check count for a bot user. */
export async function getCheckUsage(botUserId: string): Promise<number> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('check_usage')
    .select('checks')
    .eq('bot_user_id', botUserId)
    .eq('period', monthPeriod())
    .maybeSingle();
  return data?.checks ?? 0;
}

/** Atomically increment a bot user's monthly check count. Returns the new total. */
export async function incrementCheckUsage(botUserId: string, by = 1): Promise<number> {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc('increment_check_usage', {
    p_bot_user_id: botUserId,
    p_period: monthPeriod(),
    p_by: by,
  });
  if (error) throw error;
  return data ?? 0;
}
