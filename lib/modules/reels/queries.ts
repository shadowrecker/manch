import { createAdminClient } from '@/lib/supabase/admin';
import type { TrendingAudioRow } from '@/lib/db/types';
import type { HashtagSet, LanguageCode, Platform, TrendingAudioItem } from '@/lib/modules/reels/types';

// Server-only Reels queries (service-role). Account + metering queries
// (getProfile, getPlan, getUsage(userId, 'pieces'), incrementUsage, …) live in
// the shared core: '@/lib/db/queries'.

/** Content-pack credit balance (0 if the wallet doesn't exist yet). */
export async function getCreditBalance(userId: string): Promise<number> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('credit_wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.balance ?? 0;
}

// ---- Trend layer reads (only CURATED rows are ever served; PRD §8.3) ----

/** The most recent CURATED hashtag set for a language+platform, or null. */
export async function getHashtagSet(
  languageCode: LanguageCode,
  platform: Platform,
): Promise<HashtagSet | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('hashtag_sets')
    .select('tags')
    .eq('language_code', languageCode)
    .eq('platform', platform)
    .eq('curated', true)
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.tags as HashtagSet | undefined) ?? null;
}

/** Curated trending audio for a language (optionally a region). */
export async function getTrendingAudio(
  languageCode: LanguageCode,
  region?: string,
): Promise<TrendingAudioItem[]> {
  const sb = createAdminClient();
  let q = sb
    .from('trending_audio')
    .select('*')
    .eq('language_code', languageCode)
    .eq('curated', true);
  if (region) q = q.eq('region', region);
  const { data } = await q.order('week', { ascending: false }).order('rank', { ascending: true }).limit(12);
  return (data ?? []).map((r: TrendingAudioRow) => ({
    id: r.id,
    title: r.title,
    audioUrl: r.audio_url,
    mood: r.mood,
    region: r.region,
    platform: r.platform,
    rank: r.rank,
  }));
}
