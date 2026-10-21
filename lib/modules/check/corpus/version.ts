import { env } from '@/lib/env';
import { log } from '@/lib/observability';

// Monotonic corpus version. Bumped on each ingestion refresh; read by the verdict
// cache (Section C) to invalidate verdicts computed against an older corpus.
// Backed by Upstash Redis; degrades to 0 (no invalidation, TTL still applies).

const KEY = 'tcheck:corpus_version';

async function redis() {
  if (!env.upstashRedisUrl || !env.upstashRedisToken) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: env.upstashRedisUrl, token: env.upstashRedisToken });
}

export async function currentCorpusVersion(): Promise<number> {
  try {
    const r = await redis();
    if (!r) return 0;
    const v = await r.get<number>(KEY);
    return typeof v === 'number' ? v : Number(v ?? 0);
  } catch (e) {
    log.warn('corpus version read failed', { error: String(e) });
    return 0;
  }
}

export async function bumpCorpusVersion(): Promise<number> {
  try {
    const r = await redis();
    if (!r) return 0;
    return await r.incr(KEY);
  } catch (e) {
    log.warn('corpus version bump failed', { error: String(e) });
    return 0;
  }
}
