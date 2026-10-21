import { createAdminClient } from '@/lib/supabase/admin';
import { getUsage } from '@/lib/db/queries';
import type { BrandMatch } from '@/lib/modules/deals/types';
import type { BrandRow, CreatorProfileRow, IgMetricsRow, MediaKitRow } from '@/lib/db/types';

// Deals server-only query helpers (service-role). Account + metering queries
// (getProfile, getPlan, getUsage, incrementUsage) are the shared core in
// '@/lib/db/queries'.

export async function getCreatorProfile(userId: string): Promise<CreatorProfileRow | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('creator_profiles').select('*').eq('user_id', userId).maybeSingle();
  return data;
}

/** The most recent Instagram metric snapshot (live or manual-entry). */
export async function getLatestMetrics(userId: string): Promise<IgMetricsRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('ig_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** The creator's most recent media kit (for the app page). */
export async function getLatestMediaKit(userId: string): Promise<MediaKitRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('media_kits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** A media kit by its public share id (for the unauthenticated /kit/[shareId] page). */
export async function getMediaKitByShareId(shareId: string): Promise<MediaKitRow | null> {
  // Public share page: a misconfigured or unreachable DB must 404, not 500.
  try {
    const sb = createAdminClient();
    const { data } = await sb.from('media_kits').select('*').eq('share_id', shareId).maybeSingle();
    return data;
  } catch {
    return null;
  }
}

/** A single curated brand by id. */
export async function getBrandById(brandId: string): Promise<BrandRow | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('brands').select('*').eq('id', brandId).maybeSingle();
  return data;
}

/** The creator's stored brand matches, joined to brand info, best fit first. */
export async function getBrandMatches(userId: string): Promise<BrandMatch[]> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('brand_matches')
    .select('brand_id, fit_score, reasons, brands ( name, logo_url, website, niche )')
    .eq('user_id', userId)
    .order('fit_score', { ascending: false });

  type Joined = {
    brand_id: string;
    fit_score: number;
    reasons: unknown;
    brands: { name: string; logo_url: string | null; website: string | null; niche: string[] | null } | null;
  };
  return ((data as unknown as Joined[] | null) ?? []).map((m) => ({
    brandId: m.brand_id,
    name: m.brands?.name ?? 'Brand',
    fitScore: m.fit_score,
    reasons: Array.isArray(m.reasons) ? (m.reasons as string[]) : [],
    logoUrl: m.brands?.logo_url ?? null,
    website: m.brands?.website ?? null,
    niche: m.brands?.niche ?? [],
  }));
}

export interface MonthlyUsage {
  mediaKits: number;
  pitches: number;
}

/** This month's Deals usage, read from the shared usage_counters(metric) table. */
export async function getMonthlyUsage(userId: string): Promise<MonthlyUsage> {
  const [mediaKits, pitches] = await Promise.all([getUsage(userId, 'media_kits'), getUsage(userId, 'pitches')]);
  return { mediaKits, pitches };
}
