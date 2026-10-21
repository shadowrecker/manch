import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/check/corpus/embed', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/check/corpus/embed')>('@/lib/modules/check/corpus/embed');
  return { ...actual, embedText: vi.fn() };
});

import { searchCorpus } from '@/lib/modules/check/corpus/search';
import { createAdminClient } from '@/lib/supabase/admin';
import { embedText } from '@/lib/modules/check/corpus/embed';

const mAdmin = vi.mocked(createAdminClient);
const mEmbed = vi.mocked(embedText);

const ROWS = [
  { id: 'c1', source: 'pib', title: 'PIB Fact Check', url: 'https://pib.gov.in/x', chunk: 'No such tax notification was issued.', distance: 0.12 },
];

beforeEach(() => {
  mAdmin.mockReturnValue(makeSupabase({ rpc: { data: ROWS, error: null } }) as never);
});

describe('searchCorpus', () => {
  it('returns [] without embeddings (no OpenAI key)', async () => {
    mEmbed.mockResolvedValue(null);
    expect(await searchCorpus('a claim')).toEqual([]);
  });

  it('embeds the query and maps the search_corpus RPC rows to evidence', async () => {
    mEmbed.mockResolvedValue([0.1, 0.2]);
    const out = await searchCorpus('new tax notification', { limit: 6, lang: 'en' });
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('pib');
    expect(out[0].chunk).toContain('No such tax');
    expect(out[0].distance).toBe(0.12);
  });
});
