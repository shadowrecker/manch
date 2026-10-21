import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ incrementUsage: vi.fn() }));
vi.mock('@/lib/modules/deals/queries', () => ({
  getLatestMetrics: vi.fn(),
  getCreatorProfile: vi.fn(),
}));
vi.mock('@/lib/modules/deals/ai/prompts/mediakit', () => ({ composeMediaKit: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { mediaKitGenerated: 'media_kit_generated' } }));

import { generateMediaKitForUser, NoMetricsError } from '@/lib/modules/deals/services/mediakit';
import { createAdminClient } from '@/lib/supabase/admin';
import { incrementUsage } from '@/lib/db/queries';
import { getLatestMetrics, getCreatorProfile } from '@/lib/modules/deals/queries';
import { composeMediaKit } from '@/lib/modules/deals/ai/prompts/mediakit';

const mMetrics = vi.mocked(getLatestMetrics);
const mProfile = vi.mocked(getCreatorProfile);
const mCompose = vi.mocked(composeMediaKit);

const KIT = {
  headline: 'H',
  about: 'A',
  keyStatsNarrative: 'K',
  whyBrands: 'W',
  pricingNote: 'P',
};

const metricRow = {
  id: 'm1',
  user_id: 'u1',
  followers: 8500,
  engagement_rate: 4.2,
  avg_likes: 300,
  avg_comments: 25,
  top_categories: ['recipes'],
  audience: null,
  source: 'manual',
  fetched_at: '2026-01-01',
};

describe('generateMediaKitForUser', () => {
  let kitChain: ReturnType<typeof makeChain>;
  beforeEach(() => {
    kitChain = makeChain({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { media_kits: kitChain } }) as never);
    mMetrics.mockResolvedValue(metricRow as never);
    mProfile.mockResolvedValue({ niche: ['home cooking'], content_style: 'warm', city: 'Lucknow' } as never);
    mCompose.mockResolvedValue(KIT as never);
    vi.mocked(incrementUsage).mockResolvedValue(1);
  });

  it('throws NoMetricsError when the creator has no snapshot yet', async () => {
    mMetrics.mockResolvedValue(null);
    await expect(generateMediaKitForUser('u1')).rejects.toBeInstanceOf(NoMetricsError);
  });

  it('composes a kit and persists content + metrics together (self-contained share)', async () => {
    const out = await generateMediaKitForUser('u1');
    expect(out.data).toEqual(KIT);
    expect(out.metrics.followers).toBe(8500);
    expect(out.shareId).toMatch(/^[0-9a-f]{12,}$/); // url-safe random hex id

    const row = kitChain.insert.mock.calls[0][0] as { data: { kit: unknown; metrics: { followers: number } }; ai_labelled: boolean; share_id: string };
    expect(row.data.kit).toEqual(KIT);
    expect(row.data.metrics.followers).toBe(8500);
    expect(row.ai_labelled).toBe(true);
    expect(row.share_id).toBe(out.shareId);
  });

  it('passes the creator profile niche/city into the prompt', async () => {
    await generateMediaKitForUser('u1');
    const arg = mCompose.mock.calls[0][0];
    expect(arg.niche).toEqual(['home cooking']);
    expect(arg.city).toBe('Lucknow');
    expect(arg.followers).toBe(8500);
  });

  it('meters one media_kit of usage', async () => {
    await generateMediaKitForUser('u1');
    expect(incrementUsage).toHaveBeenCalledWith('u1', 'media_kits', 1);
  });

  it('still returns the kit if metering fails (kit already created)', async () => {
    vi.mocked(incrementUsage).mockRejectedValue(new Error('rpc down'));
    const out = await generateMediaKitForUser('u1');
    expect(out.data).toEqual(KIT);
  });
});
