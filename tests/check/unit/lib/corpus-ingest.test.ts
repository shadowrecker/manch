import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/check/corpus/sources', () => ({ fetchAllSources: vi.fn() }));
vi.mock('@/lib/modules/check/corpus/embed', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/check/corpus/embed')>('@/lib/modules/check/corpus/embed');
  return { ...actual, embedTexts: vi.fn() };
});
vi.mock('@/lib/modules/check/corpus/version', () => ({ bumpCorpusVersion: vi.fn() }));

import { ingestCorpus } from '@/lib/modules/check/corpus/ingest';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllSources } from '@/lib/modules/check/corpus/sources';
import { embedTexts } from '@/lib/modules/check/corpus/embed';
import { bumpCorpusVersion } from '@/lib/modules/check/corpus/version';

const mAdmin = vi.mocked(createAdminClient);
const mFetch = vi.mocked(fetchAllSources);
const mEmbed = vi.mocked(embedTexts);

const DOC = {
  source: 'altnews',
  title: 'Fake flood video debunked',
  url: 'https://altnews.in/x',
  publishedAt: '2026-06-09T00:00:00Z',
  lang: 'en',
  text: 'A recontextualised 2019 clip is being shared as a recent Mumbai flood. It is false.',
};

describe('ingestCorpus', () => {
  let corpus: ReturnType<typeof makeChain>;
  beforeEach(() => {
    corpus = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { corpus_docs: corpus } }) as never);
    vi.mocked(bumpCorpusVersion).mockResolvedValue(7);
  });

  it('no-ops when no sources are configured', async () => {
    mFetch.mockResolvedValue([]);
    const out = await ingestCorpus();
    expect(out).toEqual({ sources: 0, chunks: 0, embedded: 0, corpusVersion: 0 });
    expect(corpus.insert).not.toHaveBeenCalled();
  });

  it('chunks + embeds + upserts and bumps the corpus version', async () => {
    mFetch.mockResolvedValue([DOC]);
    mEmbed.mockResolvedValue([[0.1, 0.2]]);
    const out = await ingestCorpus();

    expect(out.sources).toBe(1);
    expect(out.chunks).toBeGreaterThan(0);
    expect(out.embedded).toBe(out.chunks);
    expect(out.corpusVersion).toBe(7);
    // fresh-URL replace then insert
    expect(corpus.delete).toHaveBeenCalled();
    const rows = corpus.insert.mock.calls[0][0] as { embedding: string; source: string }[];
    expect(rows[0].source).toBe('altnews');
    expect(rows[0].embedding).toBe('[0.1,0.2]');
  });

  it('stores chunks with null embedding when embeddings are unavailable', async () => {
    mFetch.mockResolvedValue([DOC]);
    mEmbed.mockResolvedValue(null);
    const out = await ingestCorpus();
    expect(out.embedded).toBe(0);
    const rows = corpus.insert.mock.calls[0][0] as { embedding: string | null }[];
    expect(rows[0].embedding).toBeNull();
  });
});
