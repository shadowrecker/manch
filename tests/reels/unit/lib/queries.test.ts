import { describe, it, expect, vi } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

// Account + metering queries now live in the shared core; credit + trend-layer
// reads in the Reels module.
import { getProfile, getPlan, getUsage, incrementUsage, getProfileByWhatsapp } from '@/lib/db/queries';
import { getCreditBalance, getHashtagSet, getTrendingAudio } from '@/lib/modules/reels/queries';
import { createAdminClient } from '@/lib/supabase/admin';

function withTables(tables: Record<string, ReturnType<typeof makeChain>>, rpc?: { data: unknown; error: unknown }) {
  const sb = makeSupabase({ tables, rpc });
  vi.mocked(createAdminClient).mockReturnValue(sb as never);
  return sb;
}

describe('db queries', () => {
  it('getProfile / getPlan (defaults free)', async () => {
    withTables({ profiles: makeChain({ data: { id: 'u1', plan: 'plus' }, error: null }) });
    expect((await getProfile('u1'))?.plan).toBe('plus');
    expect(await getPlan('u1')).toBe('plus');
    withTables({ profiles: makeChain({ data: null, error: null }) });
    expect(await getPlan('u1')).toBe('free');
  });

  it("getUsage(userId, 'pieces') returns count or 0", async () => {
    const chain = makeChain({ data: { used: 7 }, error: null });
    withTables({ usage_counters: chain });
    expect(await getUsage('u1', 'pieces')).toBe(7);
    expect(chain.eq).toHaveBeenCalledWith('metric', 'pieces');
    withTables({ usage_counters: makeChain({ data: null, error: null }) });
    expect(await getUsage('u1', 'pieces')).toBe(0);
  });

  it('incrementUsage calls the RPC with the pieces metric and returns the new total', async () => {
    const sb = withTables({}, { data: 8, error: null });
    expect(await incrementUsage('u1', 'pieces', 1)).toBe(8);
    expect(sb.rpc).toHaveBeenCalledWith('increment_usage', expect.objectContaining({ p_user_id: 'u1', p_metric: 'pieces', p_by: 1 }));
  });

  it('getCreditBalance returns balance or 0', async () => {
    withTables({ credit_wallets: makeChain({ data: { balance: 3 }, error: null }) });
    expect(await getCreditBalance('u1')).toBe(3);
    withTables({ credit_wallets: makeChain({ data: null, error: null }) });
    expect(await getCreditBalance('u1')).toBe(0);
  });

  it('getProfileByWhatsapp', async () => {
    withTables({ profiles: makeChain({ data: { id: 'u9' }, error: null }) });
    expect((await getProfileByWhatsapp('+9199'))?.id).toBe('u9');
  });

  it('getHashtagSet returns the curated tags or null', async () => {
    withTables({ hashtag_sets: makeChain({ data: { tags: { high: ['#a'], mid: [], niche: [] } }, error: null }) });
    expect((await getHashtagSet('hi', 'instagram'))?.high).toEqual(['#a']);
    withTables({ hashtag_sets: makeChain({ data: null, error: null }) });
    expect(await getHashtagSet('hi', 'instagram')).toBeNull();
  });

  it('getTrendingAudio maps rows → items', async () => {
    withTables({
      trending_audio: makeChain({
        data: [{ id: 'a1', title: 'गाना', audio_url: 'http://x', mood: 'hype', region: null, platform: 'instagram', rank: 1 }],
        error: null,
      }),
    });
    const items = await getTrendingAudio('hi');
    expect(items[0]).toMatchObject({ id: 'a1', title: 'गाना', audioUrl: 'http://x', mood: 'hype' });
  });
});
