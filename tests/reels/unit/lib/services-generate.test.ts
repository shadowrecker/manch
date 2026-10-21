import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/db/queries', () => ({ getProfile: vi.fn(), incrementUsage: vi.fn() }));
vi.mock('@/lib/modules/reels/payments/credits', () => ({ consumeCredit: vi.fn() }));
vi.mock('@/lib/modules/reels/ai/prompts/script', () => ({ generateThreeStyleScript: vi.fn() }));
vi.mock('@/lib/modules/reels/ai/vernacular', () => ({ normaliseScript: vi.fn((t: string) => Promise.resolve(t)) }));
vi.mock('@/lib/ai/claude', () => ({ MODEL: 'claude-test' }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { pieceGenerated: 'bhasha_piece_generated' } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { generateScriptForUser } from '@/lib/modules/reels/services/generate';
import { getProfile, incrementUsage } from '@/lib/db/queries';
import { consumeCredit } from '@/lib/modules/reels/payments/credits';
import { generateThreeStyleScript } from '@/lib/modules/reels/ai/prompts/script';
import { createAdminClient } from '@/lib/supabase/admin';

const STYLES = {
  educational: { hook: 'शिक्षा', body: 'मुख्य', cta: 'फॉलो' },
  entertainment: { hook: 'मज़ा', body: 'मुख्य', cta: 'शेयर' },
  emotional: { hook: 'भावना', body: 'मुख्य', cta: 'कमेंट' },
};

let piecesChain: ReturnType<typeof makeChain>;

beforeEach(() => {
  vi.mocked(generateThreeStyleScript).mockResolvedValue(STYLES as never);
  vi.mocked(getProfile).mockResolvedValue({ plan: 'free' } as never);
  vi.mocked(incrementUsage).mockResolvedValue(1 as never);
  vi.mocked(consumeCredit).mockResolvedValue(2 as never);
  piecesChain = makeChain({ data: null, error: null });
  vi.mocked(createAdminClient).mockReturnValue(
    makeSupabase({ tables: { bhasha_pieces: piecesChain } }) as never,
  );
});

describe('generateScriptForUser', () => {
  it('persists a script piece with the 3-style output and the AI label', async () => {
    await generateScriptForUser({
      userId: 'u1',
      languageCode: 'hi',
      platform: 'instagram',
      ideaText: 'my idea',
      source: 'web',
      meterVia: 'quota',
    });
    expect(piecesChain.insert).toHaveBeenCalledTimes(1);
    const row = piecesChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.kind).toBe('script');
    expect(row.language_code).toBe('hi');
    expect(row.output).toEqual(STYLES);
    expect(row.ai_labelled).toBe(true);
    expect(row.model).toBe('claude-test');
  });

  it('watermarks free-tier pieces, not paid', async () => {
    await generateScriptForUser({ userId: 'u1', languageCode: 'hi', platform: 'instagram', ideaText: 'x', source: 'web', meterVia: 'quota' });
    expect((piecesChain.insert.mock.calls[0][0] as { watermarked: boolean }).watermarked).toBe(true);

    vi.mocked(getProfile).mockResolvedValue({ plan: 'plus' } as never);
    await generateScriptForUser({ userId: 'u1', languageCode: 'hi', platform: 'instagram', ideaText: 'x', source: 'web', meterVia: 'quota' });
    expect((piecesChain.insert.mock.calls[1][0] as { watermarked: boolean }).watermarked).toBe(false);
  });

  it('meters via quota → incrementUsage (not credit)', async () => {
    await generateScriptForUser({ userId: 'u1', languageCode: 'hi', platform: 'instagram', ideaText: 'x', source: 'web', meterVia: 'quota' });
    expect(incrementUsage).toHaveBeenCalledWith('u1', 'pieces', 1);
    expect(consumeCredit).not.toHaveBeenCalled();
  });

  it('meters via credit → consumeCredit with the piece id (not quota)', async () => {
    const res = await generateScriptForUser({ userId: 'u1', languageCode: 'hi', platform: 'instagram', ideaText: 'x', source: 'web', meterVia: 'credit' });
    expect(consumeCredit).toHaveBeenCalledWith('u1', res.pieceId, 1);
    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it('returns the styles and a piece id', async () => {
    const res = await generateScriptForUser({ userId: 'u1', languageCode: 'gu', platform: 'instagram', ideaText: 'x', source: 'web', meterVia: 'quota' });
    expect(res.styles).toEqual(STYLES);
    expect(res.pieceId).toBeTruthy();
    expect(res.languageCode).toBe('gu');
  });
});
