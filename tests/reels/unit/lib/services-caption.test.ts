import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';
import { WATERMARK_TEXT } from '@/lib/modules/reels/entitlements';

vi.mock('@/lib/db/queries', () => ({ getProfile: vi.fn(), incrementUsage: vi.fn() }));
vi.mock('@/lib/modules/reels/payments/credits', () => ({ consumeCredit: vi.fn() }));
vi.mock('@/lib/modules/reels/ai/prompts/caption', () => ({ generateCaption: vi.fn() }));
vi.mock('@/lib/modules/reels/ai/prompts/script', () => ({ generateThreeStyleScript: vi.fn() }));
vi.mock('@/lib/modules/reels/ai/vernacular', () => ({ normaliseScript: vi.fn((t: string) => Promise.resolve(t)) }));
vi.mock('@/lib/ai/claude', () => ({ MODEL: 'claude-test' }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { pieceGenerated: 'bhasha_piece_generated' } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { generateCaptionForUser } from '@/lib/modules/reels/services/generate';
import { getProfile, incrementUsage } from '@/lib/db/queries';
import { consumeCredit } from '@/lib/modules/reels/payments/credits';
import { generateCaption } from '@/lib/modules/reels/ai/prompts/caption';
import { createAdminClient } from '@/lib/supabase/admin';

let chain: ReturnType<typeof makeChain>;

beforeEach(() => {
  vi.mocked(generateCaption).mockResolvedValue('नमस्ते दोस्तों 🎬 #reels');
  vi.mocked(getProfile).mockResolvedValue({ plan: 'free' } as never);
  chain = makeChain({ data: null, error: null });
  vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { bhasha_pieces: chain } }) as never);
});

describe('generateCaptionForUser', () => {
  it('watermarks the caption for free tier (every free caption is an ad)', async () => {
    const res = await generateCaptionForUser({
      userId: 'u1', languageCode: 'hi', platform: 'instagram', context: 'script', source: 'web', meterVia: 'quota',
    });
    expect(res.caption).toContain(WATERMARK_TEXT);
    const row = chain.insert.mock.calls[0][0] as { kind: string; watermarked: boolean; output: { caption: string } };
    expect(row.kind).toBe('caption');
    expect(row.watermarked).toBe(true);
    expect(row.output.caption).toContain(WATERMARK_TEXT);
  });

  it('does not watermark paid tiers', async () => {
    vi.mocked(getProfile).mockResolvedValue({ plan: 'plus' } as never);
    const res = await generateCaptionForUser({
      userId: 'u1', languageCode: 'hi', platform: 'instagram', context: 'script', source: 'web', meterVia: 'quota',
    });
    expect(res.caption).not.toContain(WATERMARK_TEXT);
  });

  it('meters via quota vs credit', async () => {
    await generateCaptionForUser({ userId: 'u1', languageCode: 'hi', platform: 'instagram', context: 'x', source: 'web', meterVia: 'quota' });
    expect(incrementUsage).toHaveBeenCalledWith('u1', 'pieces', 1);

    await generateCaptionForUser({ userId: 'u1', languageCode: 'hi', platform: 'instagram', context: 'x', source: 'web', meterVia: 'credit' });
    expect(consumeCredit).toHaveBeenCalled();
  });
});
