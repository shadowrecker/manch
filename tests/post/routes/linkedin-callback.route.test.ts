import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser, makeChain, makeSupabase } from '../helpers/mocks';

// Route handler test — GET /api/post/linkedin/callback.
// Mocks: supabase/server getUser, supabase/admin createAdminClient (privileged
// upsert into linkedin_tokens), linkedin/oauth exchangeCode + fetchMemberSub +
// cookie name, env (appUrl for redirect target), and next/headers cookies().

const cookieSet = vi.fn();
const cookieGet = vi.fn();
const cookieDelete = vi.fn();

vi.mock('next/headers', () => ({
  cookies: () => ({
    set: cookieSet,
    get: cookieGet,
    delete: cookieDelete,
    getAll: () => [],
  }),
  headers: () => new Headers(),
}));

vi.mock('@/lib/env', () => ({
  env: { appUrl: 'https://app.test' },
  requireEnv: (v: string) => v,
  hasEnv: () => true,
}));

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

vi.mock('@/lib/modules/post/linkedin/oauth', () => ({
  exchangeCode: vi.fn(),
  fetchMemberSub: vi.fn(),
  LINKEDIN_STATE_COOKIE: 'li_oauth_state',
}));

vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { GET } from '@/app/api/post/linkedin/callback/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, fetchMemberSub } from '@/lib/modules/post/linkedin/oauth';
import { captureException } from '@/lib/observability';

const mUser = vi.mocked(getUser);
const mAdmin = vi.mocked(createAdminClient);
const mExchange = vi.mocked(exchangeCode);
const mSub = vi.mocked(fetchMemberSub);
const mCapture = vi.mocked(captureException);

function req(qs: string) {
  return new Request(`https://app.test/api/post/linkedin/callback${qs}`) as never;
}

beforeEach(() => {
  cookieSet.mockReset();
  cookieGet.mockReset();
  cookieDelete.mockReset();
  mUser.mockResolvedValue(fakeUser() as never);
  // By default the cookie holds the matching state.
  cookieGet.mockReturnValue({ value: 'STATE123' });
  mExchange.mockResolvedValue({
    accessToken: 'at-1',
    expiresIn: 3600,
    refreshToken: 'rt-1',
    scope: 'openid profile w_member_social',
  } as never);
  mSub.mockResolvedValue('SUB42' as never);
  mAdmin.mockReturnValue(makeSupabase() as never);
});

describe('GET /api/post/linkedin/callback', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await GET(req('?code=c&state=STATE123')));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('redirects to error when state does not match the cookie', async () => {
    cookieGet.mockReturnValue({ value: 'DIFFERENT' });
    const res = await GET(req('?code=c&state=STATE123'));
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get('location')).toBe('https://app.test/post/drafts?linkedin=error');
    // The single-use state cookie is always consumed.
    expect(cookieDelete).toHaveBeenCalledWith('li_oauth_state');
    expect(mExchange).not.toHaveBeenCalled();
  });

  it('redirects to error when code is missing', async () => {
    const res = await GET(req('?state=STATE123'));
    expect(res.headers.get('location')).toBe('https://app.test/post/drafts?linkedin=error');
    expect(mExchange).not.toHaveBeenCalled();
  });

  it('redirects to error when LinkedIn returns an oauth error', async () => {
    const res = await GET(req('?error=access_denied&state=STATE123&code=c'));
    expect(res.headers.get('location')).toBe('https://app.test/post/drafts?linkedin=error');
    expect(mExchange).not.toHaveBeenCalled();
    expect(cookieDelete).toHaveBeenCalledWith('li_oauth_state');
  });

  it('success: upserts linkedin_tokens and redirects to /post/drafts connected', async () => {
    const tokens = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { linkedin_tokens: tokens } }) as never);

    const res = await GET(req('?code=auth-code&state=STATE123'));
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get('location')).toBe('https://app.test/post/drafts?linkedin=connected');

    expect(mExchange).toHaveBeenCalledWith('auth-code');
    expect(mSub).toHaveBeenCalledWith('at-1');

    // The token row is upserted on user_id with the derived member URN + scopes.
    expect(tokens.upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = tokens.upsert.mock.calls[0];
    expect(row).toEqual(
      expect.objectContaining({
        user_id: 'user-1',
        access_token: 'at-1',
        refresh_token: 'rt-1',
        member_urn: 'urn:li:person:SUB42',
        scopes: ['openid', 'profile', 'w_member_social'],
      }),
    );
    expect(opts).toEqual({ onConflict: 'user_id' });
    expect(cookieDelete).toHaveBeenCalledWith('li_oauth_state');
  });

  it('null refresh token + no scope are persisted as null', async () => {
    mExchange.mockResolvedValue({ accessToken: 'at-2', expiresIn: 100 } as never);
    const tokens = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { linkedin_tokens: tokens } }) as never);

    await GET(req('?code=c&state=STATE123'));
    const [row] = tokens.upsert.mock.calls[0];
    expect((row as { refresh_token: unknown }).refresh_token).toBeNull();
    expect((row as { scopes: unknown }).scopes).toBeNull();
  });

  it('redirects to error when the upsert returns an error', async () => {
    const tokens = makeChain({ data: null, error: { message: 'db down' } });
    mAdmin.mockReturnValue(makeSupabase({ tables: { linkedin_tokens: tokens } }) as never);

    const res = await GET(req('?code=c&state=STATE123'));
    expect(res.headers.get('location')).toBe('https://app.test/post/drafts?linkedin=error');
    expect(mCapture).toHaveBeenCalled();
  });

  it('redirects to error when exchangeCode throws', async () => {
    mExchange.mockRejectedValue(new Error('token exchange failed'));
    const res = await GET(req('?code=c&state=STATE123'));
    expect(res.headers.get('location')).toBe('https://app.test/post/drafts?linkedin=error');
    expect(mCapture).toHaveBeenCalled();
  });
});
