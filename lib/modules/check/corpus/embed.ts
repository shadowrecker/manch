import { env } from '@/lib/env';

// Embeddings for the fact-check corpus (PRD §29). Reuses CreatorStack's match
// embedding approach — one model (`text-embedding-3-small`) over normalised text.

export const EMBEDDING_DIMS = 1536;

/** pgvector text literal for a `vector` column: [0.1,0.2,...]. */
export function pgvectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * Split a document into overlapping chunks for retrieval. Sentence-aware-ish:
 * breaks on whitespace near the limit, with a small overlap so a claim that
 * straddles a boundary is still retrievable.
 */
export function chunkText(text: string, maxChars = 800, overlap = 120): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(' ', end);
      if (lastSpace > start + maxChars * 0.5) end = lastSpace;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

/**
 * Embed a single text. Returns null when no OpenAI key is configured so the rest
 * of the app degrades gracefully (no-env pattern).
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!env.openaiApiKey) return null;
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.embeddings.create({ model: env.embeddingModel, input: text });
  return res.data[0]?.embedding ?? null;
}

/** Batch-embed many texts in one call. Returns null without a key. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!env.openaiApiKey || texts.length === 0) return null;
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.embeddings.create({ model: env.embeddingModel, input: texts });
  return res.data.map((d) => d.embedding);
}
