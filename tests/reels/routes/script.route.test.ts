import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({
  getPlan: vi.fn(),
  getUsage: vi.fn(),
}));
vi.mock('@/lib/modules/reels/queries', () => ({ getCreditBalance: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/reels/services/generate', () => ({ generateScriptForUser: vi.fn() }));

import { POST } from '@/app/api/reels/script/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan, getUsage } from '@/lib/db/queries';
import { getCreditBalance } from '@/lib/modules/reels/queries';
import { rateLimit } from '@/lib/ratelimit';
import { generateScriptForUser } from '@/lib/modules/reels/services/generate';

const mUser = vi.mocked(getUser);
const mPlan = vi.mocked(getPlan);
const mUsed = vi.mocked(getUsage);
const mCredits = vi.mocked(getCreditBalance);
const mRL = vi.mocked(rateLimit);
const mGen = vi.mocked(generateScriptForUser);

function req(body: unknown) {
  return jsonRequest('http://test/api/reels/script', body);
}

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mRL.mockResolvedValue({ success: true, remaining: 29 });
  mPlan.mockResolvedValue('free');
  mUsed.mockResolvedValue(0);
  mCredits.mockResolvedValue(0);
  mGen.mockResolvedValue({
    pieceId: 'p1',
    languageCode: 'hi',
    platform: 'instagram',
    styles: {
      educational: { hook: 'h', body: 'b', cta: 'c' },
      entertainment: { hook: 'h', body: 'b', cta: 'c' },
      emotional: { hook: 'h', body: 'b', cta: 'c' },
    },
    model: 'claude',
  } as never);
});

describe('POST /api/reels/script', () => {
  it('401 unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    const { status } = await readJson(await POST(req({ languageCode: 'hi', ideaText: 'x' })));
    expect(status).toBe(401);
  });

  it('400 invalid language', async () => {
    const { status, body } = await readJson(await POST(req({ languageCode: 'xx', ideaText: 'x' })));
    expect(status).toBe(400);
    expect((body as { code: string }).code).toBe('invalid_language');
  });

  it('400 empty idea', async () => {
    const { status } = await readJson(await POST(req({ languageCode: 'hi', ideaText: '   ' })));
    expect(status).toBe(400);
  });

  it('429 rate limited', async () => {
    mRL.mockResolvedValue({ success: false, remaining: 0 });
    const { status } = await readJson(await POST(req({ languageCode: 'hi', ideaText: 'x' })));
    expect(status).toBe(429);
    expect(mGen).not.toHaveBeenCalled();
  });

  it('402 limit_reached when monthly quota AND credits are exhausted', async () => {
    mUsed.mockResolvedValue(5); // free cap
    mCredits.mockResolvedValue(0);
    const { status, body } = await readJson(await POST(req({ languageCode: 'hi', ideaText: 'x' })));
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('limit_reached');
    expect(mGen).not.toHaveBeenCalled();
  });

  it('200 meters via quota when under the monthly limit', async () => {
    const { status } = await readJson(await POST(req({ languageCode: 'hi', platform: 'moj', ideaText: 'my idea' })));
    expect(status).toBe(200);
    expect(mGen).toHaveBeenCalledWith(
      expect.objectContaining({ languageCode: 'hi', platform: 'moj', source: 'web', meterVia: 'quota' }),
    );
    expect(mUsed).toHaveBeenCalledWith('user-1', 'pieces');
  });

  it('200 meters via credit when quota exhausted but credits remain', async () => {
    mUsed.mockResolvedValue(5);
    mCredits.mockResolvedValue(3);
    const { status } = await readJson(await POST(req({ languageCode: 'ta', ideaText: 'x' })));
    expect(status).toBe(200);
    expect(mGen).toHaveBeenCalledWith(expect.objectContaining({ meterVia: 'credit' }));
  });

  it('defaults an unknown platform to instagram', async () => {
    await readJson(await POST(req({ languageCode: 'hi', platform: 'tiktok', ideaText: 'x' })));
    expect(mGen).toHaveBeenCalledWith(expect.objectContaining({ platform: 'instagram' }));
  });
});
