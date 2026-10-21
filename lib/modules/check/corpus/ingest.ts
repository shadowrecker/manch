import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllSources, type SourceDoc } from '@/lib/modules/check/corpus/sources';
import { chunkText, embedTexts, pgvectorLiteral } from '@/lib/modules/check/corpus/embed';
import { bumpCorpusVersion } from '@/lib/modules/check/corpus/version';
import { log } from '@/lib/observability';
import type { Json } from '@/lib/db/types';

// Corpus ingestion (PRD §8.2). Pull configured sources → chunk → embed → upsert.
// Runs every 6 hours via the cron (§14). Refresh semantics: replace each source
// URL's chunks so the corpus stays fresh without unbounded duplication.

export interface IngestSummary {
  sources: number;
  chunks: number;
  embedded: number;
  corpusVersion: number;
}

const EMBED_BATCH = 96;

interface ChunkRecord {
  source: string;
  title: string;
  url: string;
  published_at: string | null;
  lang: string;
  chunk: string;
}

function toChunkRecords(docs: SourceDoc[]): ChunkRecord[] {
  const records: ChunkRecord[] = [];
  for (const d of docs) {
    for (const chunk of chunkText(d.text)) {
      records.push({ source: d.source, title: d.title, url: d.url, published_at: d.publishedAt, lang: d.lang, chunk });
    }
  }
  return records;
}

export async function ingestCorpus(): Promise<IngestSummary> {
  const docs = await fetchAllSources();
  if (docs.length === 0) {
    log.info('corpus ingest: no sources configured/returned');
    return { sources: 0, chunks: 0, embedded: 0, corpusVersion: 0 };
  }

  const records = toChunkRecords(docs);
  const sb = createAdminClient();

  // Refresh: drop existing chunks for these URLs, then insert the fresh set.
  const urls = Array.from(new Set(records.map((r) => r.url).filter(Boolean)));
  if (urls.length) await sb.from('corpus_docs').delete().in('url', urls);

  let embedded = 0;
  for (let i = 0; i < records.length; i += EMBED_BATCH) {
    const batch = records.slice(i, i + EMBED_BATCH);
    const vectors = await embedTexts(batch.map((r) => r.chunk));
    const rows = batch.map((r, j) => ({
      source: r.source,
      title: r.title,
      url: r.url,
      published_at: r.published_at,
      lang: r.lang,
      chunk: r.chunk,
      embedding: vectors ? pgvectorLiteral(vectors[j]) : null,
    }));
    if (vectors) embedded += rows.length;
    const { error } = await sb.from('corpus_docs').insert(rows as unknown as Json[] as never);
    if (error) throw error;
  }

  const corpusVersion = await bumpCorpusVersion();
  log.info('corpus ingest complete', { sources: docs.length, chunks: records.length, embedded, corpusVersion });
  return { sources: docs.length, chunks: records.length, embedded, corpusVersion };
}
