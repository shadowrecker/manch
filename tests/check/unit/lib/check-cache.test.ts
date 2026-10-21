import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/check/corpus/version', () => ({ currentCorpusVersion: vi.fn() }));

import { contentHashFor, getCachedVerdict, putCachedVerdict } from '@/lib/modules/check/pipeline/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentCorpusVersion } from '@/lib/modules/check/corpus/version';
import type { Verdict } from '@/lib/modules/check/types';

const mAdmin = vi.mocked(createAdminClient);
const mVer = vi.mocked(currentCorpusVersion);

const VERDICT: Verdict = { trustScore: 3, label: 'false', explanation: 'x', claims: [], sources: [], language: 'hi' };

beforeEach(() => mVer.mockResolvedValue(5));

describe('contentHashFor', () => {
  it('hashes near-identical viral forwards to the same key', () => {
    const a = contentHashFor('BREAKING!! New UPI tax — share now!!');
    const b = contentHashFor('breaking new upi tax share now');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('getCachedVerdict', () => {
  function cacheRow(over: Record<string, unknown>) {
    return makeChain({
      data: { content_hash: 'h', language: 'hi', payload: VERDICT, corpus_version: 5, hits: 2, expires_at: new Date(Date.now() + 3_600_000).toISOString(), ...over },
      error: null,
    });
  }

  it('returns the cached verdict on a fresh hit', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { verdict_cache: cacheRow({}) } }) as never);
    expect(await getCachedVerdict('h', 'hi')).toEqual(VERDICT);
  });

  it('misses when the cached corpus version is stale', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { verdict_cache: cacheRow({ corpus_version: 4 }) } }) as never);
    expect(await getCachedVerdict('h', 'hi')).toBeNull();
  });

  it('misses when expired', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { verdict_cache: cacheRow({ expires_at: new Date(Date.now() - 1000).toISOString() }) } }) as never);
    expect(await getCachedVerdict('h', 'hi')).toBeNull();
  });

  it('misses when absent', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { verdict_cache: makeChain({ data: null, error: null }) } }) as never);
    expect(await getCachedVerdict('h', 'hi')).toBeNull();
  });
});

describe('putCachedVerdict', () => {
  it('upserts with the current corpus version', async () => {
    const cache = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { verdict_cache: cache } }) as never);
    await putCachedVerdict('h', 'hi', VERDICT);
    const row = cache.upsert.mock.calls[0][0] as { corpus_version: number; content_hash: string };
    expect(row.corpus_version).toBe(5);
    expect(row.content_hash).toBe('h');
  });
});
