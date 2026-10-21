import { createAdminClient } from '@/lib/supabase/admin';
import { embedText, pgvectorLiteral } from '@/lib/modules/check/corpus/embed';
import { log } from '@/lib/observability';

// Semantic retrieval over the fact-check corpus (PRD §8.2). Embed the query →
// pgvector cosine-kNN via the search_corpus RPC → evidence chunks for adjudication.

export interface Evidence {
  id: string;
  source: string;
  title: string | null;
  url: string | null;
  chunk: string;
  distance: number;
}

export interface SearchOptions {
  limit?: number;
  lang?: string | null;
}

/** Retrieve evidence for a claim/query. Returns [] without embeddings (graceful). */
export async function searchCorpus(query: string, opts: SearchOptions = {}): Promise<Evidence[]> {
  const vec = await embedText(query);
  if (!vec) return [];
  const sb = createAdminClient();
  const { data, error } = await sb.rpc('search_corpus', {
    p_embedding: pgvectorLiteral(vec),
    p_limit: opts.limit ?? 6,
    p_lang: opts.lang ?? null,
  });
  if (error) {
    log.warn('search_corpus failed', { error: String(error) });
    return [];
  }
  return (data ?? []) as Evidence[];
}
