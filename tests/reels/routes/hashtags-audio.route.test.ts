import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser } from '../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/modules/reels/queries', () => ({ getHashtagSet: vi.fn(), getTrendingAudio: vi.fn() }));

import { GET as hashtagsGET } from '@/app/api/reels/hashtags/route';
import { GET as audioGET } from '@/app/api/reels/audio/route';
import { getUser } from '@/lib/supabase/server';
import { getHashtagSet, getTrendingAudio } from '@/lib/modules/reels/queries';

const mUser = vi.mocked(getUser);

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  vi.mocked(getHashtagSet).mockResolvedValue({ high: ['#a'], mid: ['#b'], niche: ['#c'] });
  vi.mocked(getTrendingAudio).mockResolvedValue([
    { id: 'a1', title: 'गाना', audioUrl: 'http://x', mood: 'hype', region: null, platform: 'instagram', rank: 1 },
  ]);
});

const hq = (qs: string) => new Request(`http://test/api/reels/hashtags?${qs}`);
const aq = (qs: string) => new Request(`http://test/api/reels/audio?${qs}`);

describe('GET /api/reels/hashtags', () => {
  it('401 unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await hashtagsGET(hq('language=hi&platform=instagram')))).status).toBe(401);
  });
  it('400 invalid language', async () => {
    expect((await readJson(await hashtagsGET(hq('language=zz')))).status).toBe(400);
  });
  it('200 returns the curated set', async () => {
    const { status, body } = await readJson(await hashtagsGET(hq('language=hi&platform=instagram')));
    expect(status).toBe(200);
    expect((body as { tags: { high: string[] } }).tags.high).toEqual(['#a']);
  });
  it('200 with tags=null when nothing is curated', async () => {
    vi.mocked(getHashtagSet).mockResolvedValue(null);
    const { body } = await readJson(await hashtagsGET(hq('language=ta&platform=moj')));
    expect((body as { tags: unknown }).tags).toBeNull();
  });
});

describe('GET /api/reels/audio', () => {
  it('401 unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await audioGET(aq('language=hi')))).status).toBe(401);
  });
  it('400 invalid language', async () => {
    expect((await readJson(await audioGET(aq('language=zz')))).status).toBe(400);
  });
  it('200 returns curated audio and passes the region through', async () => {
    const { status, body } = await readJson(await audioGET(aq('language=hi&region=Mumbai')));
    expect(status).toBe(200);
    expect((body as { audio: unknown[] }).audio).toHaveLength(1);
    expect(vi.mocked(getTrendingAudio)).toHaveBeenCalledWith('hi', 'Mumbai');
  });
});
