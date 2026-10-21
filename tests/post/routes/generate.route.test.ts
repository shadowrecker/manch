import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser } from '../helpers/mocks';

// EXEMPLAR — route handler test pattern.
// Mock every spine dependency the route imports, then call the exported handler
// with a Request and assert on the Response. vi.mock factories are hoisted, so
// declare them before importing the route.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn(), getUsage: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/post/services/generate', () => {
  class NoVoiceProfileError extends Error {
    constructor() {
      super('No active voice profile');
      this.name = 'NoVoiceProfileError';
    }
  }
  return { generatePostsForUser: vi.fn(), NoVoiceProfileError };
});

import { POST } from '@/app/api/post/generate/route';
import { getUser } from '@/lib/supabase/server';
import { getPlan, getUsage } from '@/lib/db/queries';
import { rateLimit } from '@/lib/ratelimit';
import { generatePostsForUser, NoVoiceProfileError } from '@/lib/modules/post/services/generate';

const mUser = vi.mocked(getUser);
const mPlan = vi.mocked(getPlan);
const mUsed = vi.mocked(getUsage);
const mRL = vi.mocked(rateLimit);
const mGen = vi.mocked(generatePostsForUser);

function req(body: unknown) {
  return jsonRequest('http://test/api/post/generate', body);
}

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mRL.mockResolvedValue({ success: true, remaining: 19 });
  mPlan.mockResolvedValue('free');
  mUsed.mockResolvedValue(0);
  mGen.mockResolvedValue({
    genRequestId: 'g1',
    posts: [{ angle: 'story', body: 'b' }],
    detectedLang: 'english',
    model: 'claude',
  } as never);
});

describe('POST /api/post/generate', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null);
    const { status, body } = await readJson(await POST(req({ inputText: 'hi' })));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('400 when inputText is empty/whitespace', async () => {
    const { status } = await readJson(await POST(req({ inputText: '   ' })));
    expect(status).toBe(400);
  });

  it('400 on invalid JSON', async () => {
    const bad = new Request('http://test/api/post/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const { status } = await readJson(await POST(bad));
    expect(status).toBe(400);
  });

  it('429 when rate limited', async () => {
    mRL.mockResolvedValue({ success: false, remaining: 0 });
    const { status, body } = await readJson(await POST(req({ inputText: 'hi' })));
    expect(status).toBe(429);
    expect((body as { code: string }).code).toBe('rate_limited');
    expect(mGen).not.toHaveBeenCalled();
  });

  it('402 quota_exceeded at the free limit', async () => {
    mUsed.mockResolvedValue(4); // free cap is 4
    const { status, body } = await readJson(await POST(req({ inputText: 'hi' })));
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('quota_exceeded');
    expect(mGen).not.toHaveBeenCalled();
    // Post meters the shared usage_counters table under the 'posts' metric.
    expect(mUsed).toHaveBeenCalledWith('user-1', 'posts');
  });

  it('409 no_voice_profile when the service throws NoVoiceProfileError', async () => {
    mGen.mockRejectedValue(new NoVoiceProfileError());
    const { status, body } = await readJson(await POST(req({ inputText: 'hi' })));
    expect(status).toBe(409);
    expect((body as { code: string }).code).toBe('no_voice_profile');
  });

  it('500 on an unexpected service error', async () => {
    mGen.mockRejectedValue(new Error('claude down'));
    const { status } = await readJson(await POST(req({ inputText: 'hi' })));
    expect(status).toBe(500);
  });

  it('200 returns the GenerateResult and calls the service with source web', async () => {
    const { status, body } = await readJson(await POST(req({ inputText: 'Closed a deal' })));
    expect(status).toBe(200);
    expect((body as { genRequestId: string }).genRequestId).toBe('g1');
    expect(mGen).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', inputText: 'Closed a deal', source: 'web' }),
    );
  });
});
