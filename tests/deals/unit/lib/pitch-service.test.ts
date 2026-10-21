import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ incrementUsage: vi.fn() }));
vi.mock('@/lib/modules/deals/queries', () => ({
  getBrandById: vi.fn(),
  getCreatorProfile: vi.fn(),
  getLatestMetrics: vi.fn(),
}));
vi.mock('@/lib/modules/deals/services/rates', () => ({ getRateCard: vi.fn() }));
vi.mock('@/lib/modules/deals/ai/prompts/pitch', () => ({ composePitch: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { pitchSent: 'pitch_sent' } }));

import { generatePitchForBrand, normalizeDeliverables, NoBrandError, NoProfileError } from '@/lib/modules/deals/services/pitch';
import { createAdminClient } from '@/lib/supabase/admin';
import { incrementUsage } from '@/lib/db/queries';
import { getBrandById, getCreatorProfile, getLatestMetrics } from '@/lib/modules/deals/queries';
import { getRateCard } from '@/lib/modules/deals/services/rates';
import { composePitch } from '@/lib/modules/deals/ai/prompts/pitch';

const mAdmin = vi.mocked(createAdminClient);
const mBrand = vi.mocked(getBrandById);
const mProfile = vi.mocked(getCreatorProfile);
const mMetrics = vi.mocked(getLatestMetrics);
const mRateCard = vi.mocked(getRateCard);
const mCompose = vi.mocked(composePitch);

const DRAFT = { subject: 'Collab', body: 'Hi team, ...' };
const brand = { id: 'b1', name: 'Slurrp Farm', niche: ['food'], target_audience: 'parents' };

describe('normalizeDeliverables', () => {
  it('defaults to reel and filters invalid values', () => {
    expect(normalizeDeliverables(undefined)).toEqual(['reel']);
    expect(normalizeDeliverables(['story', 'garbage', 'post'])).toEqual(['story', 'post']);
    expect(normalizeDeliverables([])).toEqual(['reel']);
    expect(normalizeDeliverables(['reel', 'reel'])).toEqual(['reel']);
  });
});

describe('generatePitchForBrand', () => {
  let pitchChain: ReturnType<typeof makeChain>;
  beforeEach(() => {
    pitchChain = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { pitches: pitchChain } }) as never);
    mBrand.mockResolvedValue(brand as never);
    mProfile.mockResolvedValue({ niche: ['home cooking'], city: 'Lucknow', content_style: 'warm' } as never);
    mMetrics.mockResolvedValue({ followers: 8500, engagement_rate: 4.2 } as never);
    mRateCard.mockResolvedValue({ niche: 'food', band: 'micro', region: 'IN', rates: [], suggestedRatePaise: 1800000 } as never);
    mCompose.mockResolvedValue(DRAFT);
    vi.mocked(incrementUsage).mockResolvedValue(1);
  });

  it('throws NoBrandError when the brand does not exist', async () => {
    mBrand.mockResolvedValue(null);
    await expect(generatePitchForBrand('u1', 'missing')).rejects.toBeInstanceOf(NoBrandError);
  });

  it('throws NoProfileError when the creator has no profile or metrics', async () => {
    mProfile.mockResolvedValue(null);
    mMetrics.mockResolvedValue(null);
    await expect(generatePitchForBrand('u1', 'b1')).rejects.toBeInstanceOf(NoProfileError);
  });

  it('persists the pitch with the calculator rate and meters one pitch', async () => {
    const out = await generatePitchForBrand('u1', 'b1', ['reel', 'story']);
    expect(out.subject).toBe('Collab');
    expect(out.proposedRatePaise).toBe(1800000);

    const row = pitchChain.insert.mock.calls[0][0] as { brand_id: string; proposed_rate_paise: number; status: string; ai_labelled: boolean; deliverables: string[] };
    expect(row.brand_id).toBe('b1');
    expect(row.proposed_rate_paise).toBe(1800000);
    expect(row.status).toBe('pitched');
    expect(row.ai_labelled).toBe(true);
    expect(row.deliverables).toEqual(['reel', 'story']);
    expect(incrementUsage).toHaveBeenCalledWith('u1', 'pitches', 1);
  });

  it('feeds the suggested rate into the pitch prompt', async () => {
    await generatePitchForBrand('u1', 'b1');
    expect(mCompose.mock.calls[0][0].suggestedRatePaise).toBe(1800000);
    expect(mCompose.mock.calls[0][0].brandName).toBe('Slurrp Farm');
  });

  it('still returns the pitch if metering fails', async () => {
    vi.mocked(incrementUsage).mockRejectedValue(new Error('rpc down'));
    const out = await generatePitchForBrand('u1', 'b1');
    expect(out.subject).toBe('Collab');
  });
});
