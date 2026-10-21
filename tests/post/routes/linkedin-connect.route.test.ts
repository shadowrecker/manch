import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser } from '../helpers/mocks';

// Route handler test — GET /api/post/linkedin/connect.
// Mocks: supabase/server getUser, linkedin/oauth authUrl + cookie name, and
// next/headers cookies().set so we can assert the CSRF state cookie is written.

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

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));

vi.mock('@/lib/modules/post/linkedin/oauth', () => ({
  authUrl: vi.fn(() => 'https://www.linkedin.com/oauth/v2/authorization?state=ST&client_id=cid'),
  LINKEDIN_STATE_COOKIE: 'li_oauth_state',
}));

vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { GET } from '@/app/api/post/linkedin/connect/route';
import { getUser } from '@/lib/supabase/server';
import { authUrl, LINKEDIN_STATE_COOKIE } from '@/lib/modules/post/linkedin/oauth';

const mUser = vi.mocked(getUser);
const mAuthUrl = vi.mocked(authUrl);

beforeEach(() => {
  cookieSet.mockReset();
  cookieGet.mockReset();
  cookieDelete.mockReset();
  mUser.mockResolvedValue(fakeUser() as never);
  mAuthUrl.mockReturnValue(
    'https://www.linkedin.com/oauth/v2/authorization?state=ST&client_id=cid',
  );
});

describe('GET /api/post/linkedin/connect', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
    expect(cookieSet).not.toHaveBeenCalled();
    expect(mAuthUrl).not.toHaveBeenCalled();
  });

  it('redirects to the LinkedIn authUrl and sets the httpOnly state cookie', async () => {
    const res = await GET();
    // NextResponse.redirect uses a 307 status by default.
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get('location')).toBe(
      'https://www.linkedin.com/oauth/v2/authorization?state=ST&client_id=cid',
    );

    // The state passed to authUrl must be the same one persisted in the cookie.
    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue, cookieOpts] = cookieSet.mock.calls[0];
    expect(cookieName).toBe(LINKEDIN_STATE_COOKIE);
    expect(typeof cookieValue).toBe('string');
    expect((cookieValue as string).length).toBeGreaterThan(0);
    expect(cookieOpts).toEqual(
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );

    expect(mAuthUrl).toHaveBeenCalledTimes(1);
    expect(mAuthUrl).toHaveBeenCalledWith(cookieValue);
  });
});
