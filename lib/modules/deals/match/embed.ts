import { env } from '@/lib/env';
import { clip } from '@/lib/utils';
import type { BrandRow, CreatorProfileRow, IgMetricsRow } from '@/lib/db/types';

// Embeddings for the brand-match engine (PRD §3.2a / §8.3).
// One embedding model over a normalised profile/brand text → pgvector.

export const EMBEDDING_DIMS = 1536;

/** Normalised text for a creator profile — what we embed for matching. */
export function creatorProfileText(profile: CreatorProfileRow | null, metrics: IgMetricsRow | null): string {
  const niche = profile?.niche?.length ? profile.niche.join(', ') : 'general';
  const cats = (metrics?.top_categories as string[] | null)?.join(', ') || niche;
  return clip(
    [
      `Creator niche: ${niche}.`,
      `Content style: ${profile?.content_style ?? 'general'}.`,
      `City: ${profile?.city ?? 'India'}. Language: ${profile?.primary_language ?? 'Hindi/English'}.`,
      `Audience size band: ${profile?.follower_band ?? 'micro'}.`,
      `Top content categories: ${cats}.`,
    ].join(' '),
    1200,
  );
}

/** Normalised text for a brand — what we embed at curation time. */
export function brandText(brand: Pick<BrandRow, 'name' | 'niche' | 'target_audience' | 'tier_focus' | 'typical_creator_size'>): string {
  const niche = brand.niche?.length ? brand.niche.join(', ') : 'general';
  return clip(
    [
      `Brand: ${brand.name}.`,
      `Categories: ${niche}.`,
      `Target audience: ${brand.target_audience ?? 'general Indian consumers'}.`,
      `Tier focus: ${brand.tier_focus ?? 'value'}.`,
      `Works with creators of size: ${brand.typical_creator_size ?? 'micro/mid'}.`,
    ].join(' '),
    1200,
  );
}

/** pgvector text literal for a `vector` column: [0.1,0.2,...]. */
export function pgvectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * Embed a single text. Returns null when no OpenAI key is configured so the
 * rest of the app degrades gracefully (no-env pattern).
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!env.openaiApiKey) return null;
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.embeddings.create({ model: env.embeddingModel, input: text });
  return res.data[0]?.embedding ?? null;
}
