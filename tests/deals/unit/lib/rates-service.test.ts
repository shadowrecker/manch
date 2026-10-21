import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/deals/queries', () => ({ getCreatorProfile: vi.fn(), getLatestMetrics: vi.fn() }));
vi.mock('@/lib/modules/deals/ai/prompts/rate', () => ({ rateRationale: vi.fn() }));

import { getRateCard, getRateCardWithRationale, lookupRates } from '@/lib/modules/deals/services/rates';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCreatorProfile, getLatestMetrics } from '@/lib/modules/deals/queries';
import { rateRationale } from '@/lib/modules/deals/ai/prompts/rate';

const mAdmin = vi.mocked(createAdminClient);
const mProfile = vi.mocked(getCreatorProfile);
const mMetrics = vi.mocked(getLatestMetrics);
const mRationale = vi.mocked(rateRationale);

// rate_benchmarks rows returned out of deliverable order to test sorting
const rows = [
  { deliverable: 'post', p25_paise: 600000, p50_paise: 1000000, p75_paise: 1600000, sample_size: 62, niche: 'beauty', follower_band: 'micro', region: 'IN' },
  { deliverable: 'reel', p25_paise: 1080000, p50_paise: 1800000, p75_paise: 2880000, sample_size: 62, niche: 'beauty', follower_band: 'micro', region: 'IN' },
  { deliverable: 'story', p25_paise: 240000, p50_paise: 400000, p75_paise: 640000, sample_size: 62, niche: 'beauty', follower_band: 'micro', region: 'IN' },
];

function supaWith(data: unknown) {
  const rb = makeChain({ data, error: null });
  return makeSupabase({ tables: { rate_benchmarks: rb } });
}

beforeEach(() => {
  mAdmin.mockReturnValue(supaWith(rows) as never);
  mProfile.mockResolvedValue({ niche: ['Beauty'], follower_band: 'micro', city: 'Mumbai', content_style: 'fun' } as never);
  mMetrics.mockResolvedValue({ engagement_rate: 5.1 } as never);
  mRationale.mockResolvedValue('Negotiate from the median.');
});

describe('lookupRates', () => {
  it('maps rows and sorts by deliverable order (reel, story, post, bundle)', async () => {
    const out = await lookupRates('beauty', 'micro');
    expect(out.map((r) => r.deliverable)).toEqual(['reel', 'story', 'post']);
    expect(out[0].p50Paise).toBe(1800000);
  });
});

describe('getRateCard', () => {
  it('lowercases the niche, picks the band, and suggests the reel p50', async () => {
    const card = await getRateCard('u1');
    expect(card).not.toBeNull();
    expect(card!.niche).toBe('beauty');
    expect(card!.band).toBe('micro');
    expect(card!.suggestedRatePaise).toBe(1800000); // reel p50
  });

  it('returns null without a creator profile', async () => {
    mProfile.mockResolvedValue(null);
    expect(await getRateCard('u1')).toBeNull();
  });
});

describe('getRateCardWithRationale', () => {
  it('adds a Claude rationale when benchmarks exist', async () => {
    const card = await getRateCardWithRationale('u1');
    expect(card!.rationale).toBe('Negotiate from the median.');
    expect(mRationale).toHaveBeenCalled();
  });

  it('skips the AI call when there are no benchmarks', async () => {
    mAdmin.mockReturnValue(supaWith([]) as never);
    const card = await getRateCardWithRationale('u1');
    expect(card!.rates).toEqual([]);
    expect(card!.rationale).toBeNull();
    expect(mRationale).not.toHaveBeenCalled();
  });
});
