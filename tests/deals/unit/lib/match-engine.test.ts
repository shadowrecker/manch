import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/deals/queries', () => ({ getCreatorProfile: vi.fn(), getLatestMetrics: vi.fn() }));
vi.mock('@/lib/modules/deals/match/embed', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/deals/match/embed')>('@/lib/modules/deals/match/embed');
  return { ...actual, embedText: vi.fn() };
});
vi.mock('@/lib/modules/deals/ai/prompts/match', () => ({ rerankMatches: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { brandMatchRun: 'brand_match_run' } }));

import { runMatch, ensureCreatorEmbedding, NoProfileError, EmbeddingsUnavailableError } from '@/lib/modules/deals/match/engine';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCreatorProfile, getLatestMetrics } from '@/lib/modules/deals/queries';
import { embedText } from '@/lib/modules/deals/match/embed';
import { rerankMatches } from '@/lib/modules/deals/ai/prompts/match';

const mAdmin = vi.mocked(createAdminClient);
const mProfile = vi.mocked(getCreatorProfile);
const mMetrics = vi.mocked(getLatestMetrics);
const mEmbed = vi.mocked(embedText);
const mRerank = vi.mocked(rerankMatches);

const embeddedProfile = { user_id: 'u1', niche: ['home cooking'], content_style: 'warm', city: 'Lucknow', follower_band: 'micro', embedding: '[0.1,0.2]', primary_language: 'Hindi', updated_at: '2026-01-01' };
const metrics = { followers: 8500, engagement_rate: 4.2, top_categories: ['recipes'] };
const brandRow = { id: 'b1', name: 'Slurrp Farm', website: 'https://slurrpfarm.com', logo_url: null, niche: ['food', 'parenting'], target_audience: 'parents', tier_focus: 'value', typical_creator_size: 'micro', signals: {}, embedding: '[0.1]', source: 'seed', curated: true, created_at: '2026-01-01' };

function supa(opts: { profileEmbedding?: string | null; shortlist?: unknown; brands?: unknown } = {}) {
  const cp = makeChain({ data: null, error: null });
  const brands = makeChain({ data: opts.brands ?? [brandRow], error: null });
  const bm = makeChain({ data: null, error: null });
  const client = makeSupabase({
    tables: { creator_profiles: cp, brands, brand_matches: bm },
    rpc: { data: opts.shortlist ?? [{ brand_id: 'b1', distance: 0.12 }], error: null },
  });
  return { client, cp, brands, bm };
}

beforeEach(() => {
  mProfile.mockResolvedValue(embeddedProfile as never);
  mMetrics.mockResolvedValue(metrics as never);
  mEmbed.mockResolvedValue([0.1, 0.2]);
  mRerank.mockResolvedValue([{ brandId: 'b1', fitScore: 88, reasons: ['shared food niche', 'parent audience fit'] }]);
});

describe('ensureCreatorEmbedding', () => {
  it('throws NoProfileError without a creator profile', async () => {
    mProfile.mockResolvedValue(null);
    await expect(ensureCreatorEmbedding('u1')).rejects.toBeInstanceOf(NoProfileError);
  });

  it('keeps the existing embedding (no recompute)', async () => {
    const { client } = supa();
    mAdmin.mockReturnValue(client as never);
    expect(await ensureCreatorEmbedding('u1')).toBe(true);
    expect(mEmbed).not.toHaveBeenCalled();
  });

  it('computes + stores an embedding when missing', async () => {
    mProfile.mockResolvedValue({ ...embeddedProfile, embedding: null } as never);
    const { client, cp } = supa();
    mAdmin.mockReturnValue(client as never);
    expect(await ensureCreatorEmbedding('u1')).toBe(true);
    expect(mEmbed).toHaveBeenCalled();
    expect((cp.update.mock.calls[0][0] as { embedding: string }).embedding).toBe('[0.1,0.2]');
  });

  it('returns false when embeddings are unavailable', async () => {
    mProfile.mockResolvedValue({ ...embeddedProfile, embedding: null } as never);
    mEmbed.mockResolvedValue(null);
    const { client } = supa();
    mAdmin.mockReturnValue(client as never);
    expect(await ensureCreatorEmbedding('u1')).toBe(false);
  });
});

describe('runMatch', () => {
  it('embeds → kNN shortlist → rerank → persists + returns ranked matches', async () => {
    const { client, bm } = supa();
    mAdmin.mockReturnValue(client as never);

    const out = await runMatch('u1');

    expect(client.rpc).toHaveBeenCalledWith('match_brands', { p_user_id: 'u1', p_limit: 50 });
    expect(mRerank).toHaveBeenCalled();
    // old matches cleared, then new ones inserted
    expect(bm.delete).toHaveBeenCalled();
    const inserted = bm.insert.mock.calls[0][0] as { brand_id: string; fit_score: number; reasons: string[] }[];
    expect(inserted[0]).toMatchObject({ brand_id: 'b1', fit_score: 88 });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ brandId: 'b1', name: 'Slurrp Farm', fitScore: 88, website: 'https://slurrpfarm.com' });
    expect(out[0].reasons).toContain('shared food niche');
  });

  it('throws EmbeddingsUnavailableError when matching cannot run', async () => {
    mProfile.mockResolvedValue({ ...embeddedProfile, embedding: null } as never);
    mEmbed.mockResolvedValue(null);
    const { client } = supa();
    mAdmin.mockReturnValue(client as never);
    await expect(runMatch('u1')).rejects.toBeInstanceOf(EmbeddingsUnavailableError);
  });

  it('returns [] on an empty shortlist (cold start)', async () => {
    const { client, bm } = supa({ shortlist: [] });
    mAdmin.mockReturnValue(client as never);
    const out = await runMatch('u1');
    expect(out).toEqual([]);
    expect(mRerank).not.toHaveBeenCalled();
    expect(bm.insert).not.toHaveBeenCalled();
  });

  it('drops reranked ids that are not in the candidate set', async () => {
    mRerank.mockResolvedValue([
      { brandId: 'ghost', fitScore: 99, reasons: ['hallucinated'] },
      { brandId: 'b1', fitScore: 70, reasons: ['real'] },
    ]);
    const { client } = supa();
    mAdmin.mockReturnValue(client as never);
    const out = await runMatch('u1');
    expect(out.map((m) => m.brandId)).toEqual(['b1']);
  });
});
