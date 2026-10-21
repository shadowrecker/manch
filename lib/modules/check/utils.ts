// Check-specific helpers. Generic helpers (monthPeriod, randomId, formatINR,
// clip, …) live in the shared core: @/lib/utils.

/**
 * Normalise text for the content-hash cache key: lowercase, strip punctuation,
 * collapse whitespace. Two forwards of "the same" message hash identically so a
 * viral forward is checked once and served from cache (PRD §3.2d). Pure (no crypto)
 * so it runs anywhere; the sha256 itself lives in pipeline/cache.ts (server).
 */
export function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, ' ') // links vary; the claim is what matters
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
