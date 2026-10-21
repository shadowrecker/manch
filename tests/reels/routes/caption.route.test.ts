import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn(), getUsage: vi.fn() }));
vi.mock('@/lib/modules/reels/queries', () => ({ getCreditBalance: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/reels/services/generate', () => ({ generateCaptionForUser: vi.fn() }));

import { POST } from '@/app/api/reels/caption/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan, getUsage } from '@/lib/db/queries';
import { getCreditBalance } from '@/lib/modules/reels/queries';
import { rateLimit } from '@/lib/ratelimit';
import { generateCaptionForUser } from '@/lib/modules/reels/services/generate';

const mUser = vi.mocked(getUser);
const mGen = vi.mocked(generateCaptionForUser);

const req = (b: unknown) => jsonRequest('http://test/api/reels/caption', b);

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 29 });
  vi.mocked(getPlan).mockResolvedValue('free');
  vi.mocked(getUsage).mockResolvedValue(0);
  vi.mocked(getCreditBalance).mockResolvedValue(0);
  mGen.mockResolvedValue({ pieceId: 'c1', caption: 'नमस्ते #reels' } as never);
});

describe('POST /api/reels/caption', () => {
  it('401 unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST(req({ languageCode: 'hi', context: 'x' })))).status).toBe(401);
  });
  it('400 invalid language', async () => {
    expect((await readJson(await POST(req({ languageCode: 'zz', context: 'x' })))).status).toBe(400);
  });
  it('400 empty context', async () => {
    expect((await readJson(await POST(req({ languageCode: 'hi', context: '  ' })))).status).toBe(400);
  });
  it('402 when quota + credits exhausted', async () => {
    vi.mocked(getUsage).mockResolvedValue(5);
    const { status, body } = await readJson(await POST(req({ languageCode: 'hi', context: 'x' })));
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('limit_reached');
    expect(mGen).not.toHaveBeenCalled();
  });
  it('200 returns the caption and meters via quota', async () => {
    const { status, body } = await readJson(await POST(req({ languageCode: 'hi', platform: 'instagram', context: 'my script' })));
    expect(status).toBe(200);
    expect((body as { caption: string }).caption).toBe('नमस्ते #reels');
    expect(mGen).toHaveBeenCalledWith(expect.objectContaining({ meterVia: 'quota', source: 'web' }));
  });
});
