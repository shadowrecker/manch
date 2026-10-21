import type { IgMetrics } from '@/lib/modules/deals/types';

// Instagram Graph pulls (modern Instagram Login). Returns a normalised metric
// snapshot. Endpoints/fields vary by account + permissions; this maps what's
// reliably available and leaves the rest optional.

const BASE = 'https://graph.instagram.com';

export interface IgProfile {
  igUserId: string;
  username: string | null;
  accountType: string | null;
  followers: number | null;
}

export async function fetchProfile(token: string, igUserId: string): Promise<IgProfile> {
  const url = `${BASE}/${igUserId}?fields=username,account_type,followers_count&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`instagram profile fetch failed: ${res.status}`);
  const j = (await res.json()) as { username?: string; account_type?: string; followers_count?: number };
  return {
    igUserId,
    username: j.username ?? null,
    accountType: j.account_type ?? null,
    followers: j.followers_count ?? null,
  };
}

interface MediaItem {
  like_count?: number;
  comments_count?: number;
  caption?: string;
}

/** Pull recent media to estimate avg likes/comments + engagement rate. */
export async function fetchRecentMedia(token: string, igUserId: string): Promise<MediaItem[]> {
  const url = `${BASE}/${igUserId}/media?fields=like_count,comments_count,caption&limit=12&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`instagram media fetch failed: ${res.status}`);
  const j = (await res.json()) as { data?: MediaItem[] };
  return j.data ?? [];
}

/** Compose a full metric snapshot from the Graph API. */
export async function fetchMetrics(token: string, igUserId: string): Promise<IgMetrics & { username: string | null; accountType: string | null }> {
  const profile = await fetchProfile(token, igUserId);
  const media = await fetchRecentMedia(token, igUserId).catch(() => [] as MediaItem[]);

  const n = media.length || 1;
  const totalLikes = media.reduce((s, m) => s + (m.like_count ?? 0), 0);
  const totalComments = media.reduce((s, m) => s + (m.comments_count ?? 0), 0);
  const avgLikes = media.length ? Math.round(totalLikes / n) : null;
  const avgComments = media.length ? Math.round(totalComments / n) : null;
  const engagementRate =
    profile.followers && media.length
      ? Number((((totalLikes + totalComments) / n / profile.followers) * 100).toFixed(2))
      : null;

  return {
    followers: profile.followers,
    engagementRate,
    avgLikes,
    avgComments,
    topCategories: [],
    audience: null,
    username: profile.username,
    accountType: profile.accountType,
  };
}
