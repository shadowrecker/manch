import { describe, it, expect, vi } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getUsage: vi.fn() }));

import { getMonthlyUsage, getBrandMatches, getMediaKitByShareId } from '@/lib/modules/deals/queries';
import { getUsage } from '@/lib/db/queries';
import { createAdminClient } from '@/lib/supabase/admin';

describe('getMonthlyUsage (built on core usage_counters metrics)', () => {
  it('reads the media_kits and pitches metrics', async () => {
    vi.mocked(getUsage).mockImplementation(async (_u, metric) => (metric === 'media_kits' ? 2 : 7));
    expect(await getMonthlyUsage('u1')).toEqual({ mediaKits: 2, pitches: 7 });
    expect(getUsage).toHaveBeenCalledWith('u1', 'media_kits');
    expect(getUsage).toHaveBeenCalledWith('u1', 'pitches');
  });
});

describe('getBrandMatches', () => {
  it('maps joined brand rows, tolerating missing brand info and non-array reasons', async () => {
    const bm = makeChain({
      data: [
        { brand_id: 'b1', fit_score: 88, reasons: ['niche fit'], brands: { name: 'Slurrp Farm', logo_url: null, website: 'https://x', niche: ['food'] } },
        { brand_id: 'b2', fit_score: 40, reasons: null, brands: null },
      ],
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { brand_matches: bm } }) as never);
    const out = await getBrandMatches('u1');
    expect(out[0]).toMatchObject({ brandId: 'b1', name: 'Slurrp Farm', fitScore: 88, reasons: ['niche fit'], website: 'https://x' });
    expect(out[1]).toMatchObject({ brandId: 'b2', name: 'Brand', reasons: [], niche: [] });
  });
});

describe('getMediaKitByShareId', () => {
  it('looks the kit up by its public share id', async () => {
    const kits = makeChain({ data: { id: 'k1', share_id: 'abc' }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { media_kits: kits } }) as never);
    expect(await getMediaKitByShareId('abc')).toMatchObject({ id: 'k1' });
    expect(kits.eq).toHaveBeenCalledWith('share_id', 'abc');
  });

  it('returns null (→ 404) when the DB is unreachable or unconfigured', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL');
    });
    expect(await getMediaKitByShareId('abc')).toBeNull();
  });
});
