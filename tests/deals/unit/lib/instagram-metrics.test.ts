import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { fetchMetrics } from '@/lib/modules/deals/instagram/graph';
import { manualMetrics, snapshotMetrics } from '@/lib/modules/deals/instagram/metrics';
import { createAdminClient } from '@/lib/supabase/admin';

afterEach(() => vi.unstubAllGlobals());

describe('graph.fetchMetrics', () => {
  it('maps profile + recent media into a metric snapshot', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ username: 'anjali', account_type: 'CREATOR', followers_count: 10000 }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ like_count: 400, comments_count: 100 }, { like_count: 200, comments_count: 0 }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const m = await fetchMetrics('tok', '123');
    expect(m.followers).toBe(10000);
    expect(m.username).toBe('anjali');
    expect(m.accountType).toBe('CREATOR');
    expect(m.avgLikes).toBe(300); // (400+200)/2
    expect(m.avgComments).toBe(50); // (100+0)/2
    // ER = (totalLikes+totalComments)/n / followers * 100 = (600+100)/2/10000*100 = 3.5
    expect(m.engagementRate).toBe(3.5);
  });
});

describe('metrics service', () => {
  let igChain: ReturnType<typeof makeChain>;
  let cpChain: ReturnType<typeof makeChain>;
  beforeEach(() => {
    igChain = makeChain({ data: null, error: null });
    cpChain = makeChain({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ tables: { ig_metrics: igChain, creator_profiles: cpChain } }) as never,
    );
  });

  it('snapshotMetrics inserts a metrics row + sets the follower band', async () => {
    await snapshotMetrics('u1', { followers: 5000, engagementRate: 4, avgLikes: 100, avgComments: 10, topCategories: ['food'], audience: null }, 'instagram');
    const row = igChain.insert.mock.calls[0][0] as { source: string; followers: number };
    expect(row.source).toBe('instagram');
    expect(row.followers).toBe(5000);
    expect((cpChain.upsert.mock.calls[0][0] as { follower_band: string }).follower_band).toBe('nano');
  });

  it('manualMetrics records source=manual and the creator profile fields', async () => {
    await manualMetrics('u1', { followers: 50000, niche: ['fitness'], contentStyle: 'energetic', city: 'Pune' });
    expect((igChain.insert.mock.calls[0][0] as { source: string }).source).toBe('manual');
    const cp = cpChain.upsert.mock.calls.at(-1)![0] as { niche: string[]; follower_band: string; content_style: string };
    expect(cp.niche).toEqual(['fitness']);
    expect(cp.follower_band).toBe('micro');
    expect(cp.content_style).toBe('energetic');
  });
});
