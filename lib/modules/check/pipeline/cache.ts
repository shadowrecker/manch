import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeForHash } from '@/lib/modules/check/utils';
import { currentCorpusVersion } from '@/lib/modules/check/corpus/version';
import { env } from '@/lib/env';
import { log } from '@/lib/observability';
import type { LanguageCode, Verdict } from '@/lib/modules/check/types';
import type { Json } from '@/lib/db/types';

// Content-hash verdict cache (PRD §3.2d). A viral forward is checked once and
// served from cache to the next million recipients — the latency, cost and telco
// economics, all at once. Keyed by (normalised-content hash, language); a
// corpus-version bump or TTL invalidates a stale verdict.

/** Stable cache key for a forward (sha256 over the normalised text). */
export function contentHashFor(text: string): string {
  return crypto.createHash('sha256').update(normalizeForHash(text)).digest('hex');
}

export async function getCachedVerdict(hash: string, language: LanguageCode): Promise<Verdict | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('verdict_cache')
    .select('*')
    .eq('content_hash', hash)
    .eq('language', language)
    .maybeSingle();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  const version = await currentCorpusVersion();
  if (data.corpus_version < version) return null; // computed against an older corpus
  // best-effort hit counter (don't block on it)
  void sb.from('verdict_cache').update({ hits: data.hits + 1 }).eq('content_hash', hash).eq('language', language);
  return data.payload as unknown as Verdict;
}

export async function putCachedVerdict(hash: string, language: LanguageCode, verdict: Verdict): Promise<void> {
  const sb = createAdminClient();
  const version = await currentCorpusVersion();
  const expiresAt = new Date(Date.now() + env.verdictCacheTtlHours * 3_600_000).toISOString();
  const { error } = await sb.from('verdict_cache').upsert({
    content_hash: hash,
    language,
    payload: verdict as unknown as Json,
    corpus_version: version,
    expires_at: expiresAt,
  });
  if (error) log.warn('verdict cache put failed', { error: String(error) });
}
