import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

// Mock the admin client + observability so the module imports without secrets
// and we can drive the linkedin_tokens lookup. vi.mock is hoisted.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { publishPost, LinkedInNotConnectedError } from '@/lib/modules/post/linkedin/post';
import { createAdminClient } from '@/lib/supabase/admin';

const mAdmin = vi.mocked(createAdminClient);

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

function adminWithToken(row: unknown) {
  return makeSupabase({
    tables: { linkedin_tokens: makeChain({ data: row, error: null }) },
  });
}

describe('publishPost', () => {
  it('publishes and returns externalId from the x-restli-id header', async () => {
    mAdmin.mockReturnValue(
      adminWithToken({ access_token: 'tok-1', member_urn: 'urn:li:person:abc' }) as never,
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:9999' } }),
    );

    const out = await publishPost('user-1', 'hello world');
    expect(out).toEqual({ externalId: 'urn:li:share:9999' });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.linkedin.com/v2/ugcPosts');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-1');
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');

    const payload = JSON.parse(init?.body as string);
    expect(payload.author).toBe('urn:li:person:abc');
    expect(payload.lifecycleState).toBe('PUBLISHED');
    expect(payload.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary.text).toBe(
      'hello world',
    );
  });

  it('falls back to the JSON body id when the header is absent', async () => {
    mAdmin.mockReturnValue(
      adminWithToken({ access_token: 'tok-1', member_urn: 'urn:li:person:abc' }) as never,
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 'urn:li:ugcPost:42' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const out = await publishPost('user-1', 'hi');
    expect(out).toEqual({ externalId: 'urn:li:ugcPost:42' });
  });

  it('returns empty externalId when neither header nor JSON body provide one', async () => {
    mAdmin.mockReturnValue(
      adminWithToken({ access_token: 'tok-1', member_urn: 'urn:li:person:abc' }) as never,
    );
    vi.mocked(fetch).mockResolvedValue(new Response('not-json', { status: 201 }));

    const out = await publishPost('user-1', 'hi');
    expect(out).toEqual({ externalId: '' });
  });

  it('throws LinkedInNotConnectedError when there is no token row', async () => {
    mAdmin.mockReturnValue(adminWithToken(null) as never);
    await expect(publishPost('user-1', 'hi')).rejects.toBeInstanceOf(LinkedInNotConnectedError);
  });

  it('throws LinkedInNotConnectedError when the row lacks access_token', async () => {
    mAdmin.mockReturnValue(
      adminWithToken({ access_token: '', member_urn: 'urn:li:person:abc' }) as never,
    );
    await expect(publishPost('user-1', 'hi')).rejects.toBeInstanceOf(LinkedInNotConnectedError);
  });

  it('throws LinkedInNotConnectedError when the row lacks member_urn', async () => {
    mAdmin.mockReturnValue(
      adminWithToken({ access_token: 'tok-1', member_urn: null }) as never,
    );
    await expect(publishPost('user-1', 'hi')).rejects.toBeInstanceOf(LinkedInNotConnectedError);
  });

  it('rethrows a Supabase lookup error', async () => {
    mAdmin.mockReturnValue(
      makeSupabase({
        tables: {
          linkedin_tokens: makeChain({ data: null, error: new Error('db down') }),
        },
      }) as never,
    );
    await expect(publishPost('user-1', 'hi')).rejects.toThrow(/db down/);
  });

  it('throws with the HTTP status when ugcPosts returns non-ok', async () => {
    mAdmin.mockReturnValue(
      adminWithToken({ access_token: 'tok-1', member_urn: 'urn:li:person:abc' }) as never,
    );
    vi.mocked(fetch).mockResolvedValue(new Response('rate limited', { status: 429 }));
    await expect(publishPost('user-1', 'hi')).rejects.toThrow(/429/);
  });
});
