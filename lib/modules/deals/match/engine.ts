import { createAdminClient } from '@/lib/supabase/admin';
import { getCreatorProfile, getLatestMetrics } from '@/lib/modules/deals/queries';
import { creatorProfileText, embedText, pgvectorLiteral } from '@/lib/modules/deals/match/embed';
import { rerankMatches, type RerankCandidate } from '@/lib/modules/deals/ai/prompts/match';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log } from '@/lib/observability';
import type { BrandMatch } from '@/lib/modules/deals/types';
import type { BrandRow } from '@/lib/db/types';

export class NoProfileError extends Error {
  constructor() {
    super('No creator profile — connect Instagram or enter stats first');
    this.name = 'NoProfileError';
  }
}

export class EmbeddingsUnavailableError extends Error {
  constructor() {
    super('Embeddings are not configured (OPENAI_API_KEY missing)');
    this.name = 'EmbeddingsUnavailableError';
  }
}

const SHORTLIST = 50; // pgvector kNN candidates handed to the reranker

/**
 * Ensure the creator has an embedding stored. Returns false if embeddings are
 * unavailable (no OpenAI key). Recomputes when missing.
 */
export async function ensureCreatorEmbedding(userId: string): Promise<boolean> {
  const profile = await getCreatorProfile(userId);
  if (!profile) throw new NoProfileError();
  if (profile.embedding) return true;

  const metrics = await getLatestMetrics(userId);
  const vec = await embedText(creatorProfileText(profile, metrics));
  if (!vec) return false;

  const sb = createAdminClient();
  const { error } = await sb
    .from('creator_profiles')
    .update({ embedding: pgvectorLiteral(vec) })
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

/**
 * Run the match engine: embed → pgvector kNN shortlist → Claude rerank →
 * persist brand_matches. Returns the ranked, explainable matches (C-02).
 */
export async function runMatch(userId: string, limit = 8): Promise<BrandMatch[]> {
  const ready = await ensureCreatorEmbedding(userId);
  if (!ready) throw new EmbeddingsUnavailableError();

  const sb = createAdminClient();
  const { data: shortlist, error: knnErr } = await sb.rpc('match_brands', {
    p_user_id: userId,
    p_limit: SHORTLIST,
  });
  if (knnErr) throw knnErr;

  const ids = (shortlist ?? []).map((r) => r.brand_id);
  if (ids.length === 0) {
    log.info('match: empty shortlist', { userId });
    return [];
  }

  const { data: brandRows } = await sb.from('brands').select('*').in('id', ids);
  const brands = (brandRows ?? []) as BrandRow[];
  const byId = new Map(brands.map((b) => [b.id, b]));

  const candidates: RerankCandidate[] = brands.map((b) => ({
    brandId: b.id,
    name: b.name,
    niche: b.niche ?? [],
    targetAudience: b.target_audience,
    tierFocus: b.tier_focus,
    typicalCreatorSize: b.typical_creator_size,
  }));

  const [profile, metrics] = await Promise.all([getCreatorProfile(userId), getLatestMetrics(userId)]);
  const ranked = await rerankMatches(
    {
      niche: profile?.niche ?? [],
      contentStyle: profile?.content_style ?? null,
      city: profile?.city ?? null,
      followerBand: profile?.follower_band ?? null,
      followers: metrics?.followers ?? null,
      engagementRate: metrics?.engagement_rate ?? null,
    },
    candidates,
  );

  // Keep only ranked brands we actually have rows for, top N.
  const top = ranked.filter((m) => byId.has(m.brandId)).slice(0, limit);

  // Persist: replace this creator's match set.
  await sb.from('brand_matches').delete().eq('user_id', userId);
  if (top.length) {
    const { error: insErr } = await sb.from('brand_matches').insert(
      top.map((m) => ({
        user_id: userId,
        brand_id: m.brandId,
        fit_score: m.fitScore,
        reasons: m.reasons as unknown as BrandRow['signals'],
      })),
    );
    if (insErr) throw insErr;
  }

  await captureServer(EVENTS.brandMatchRun, userId, { top_fit_score: top[0]?.fitScore ?? 0, count: top.length });

  return top.map((m) => {
    const b = byId.get(m.brandId)!;
    return {
      brandId: m.brandId,
      name: b.name,
      fitScore: m.fitScore,
      reasons: m.reasons,
      logoUrl: b.logo_url,
      website: b.website,
      niche: b.niche ?? [],
    };
  });
}
