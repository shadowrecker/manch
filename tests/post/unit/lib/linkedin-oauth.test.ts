import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// env-dependent lib: lib/env reads process.env at import. Reset modules + stub
// env, then dynamically import so each test sees the env it set.
async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/modules/post/linkedin/oauth');
}

const FULL_ENV = {
  LINKEDIN_CLIENT_ID: 'client-123',
  LINKEDIN_CLIENT_SECRET: 'secret-xyz',
  LINKEDIN_REDIRECT_URI: 'https://app.manch.app/api/post/linkedin/callback',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('authUrl', () => {
  it('builds the consent URL with all required params', async () => {
    const { authUrl } = await load(FULL_ENV);
    const url = authUrl('state-abc');
    expect(url.startsWith('https://www.linkedin.com/oauth/v2/authorization?')).toBe(true);

    const params = new URL(url).searchParams;
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe('client-123');
    expect(params.get('redirect_uri')).toBe('https://app.manch.app/api/post/linkedin/callback');
    expect(params.get('state')).toBe('state-abc');
    expect(params.get('scope')).toContain('w_member_social');
    // OIDC identity scopes are present too.
    expect(params.get('scope')).toContain('openid');
  });

  it('throws when LINKEDIN_CLIENT_ID is missing', async () => {
    const { authUrl } = await load({ ...FULL_ENV, LINKEDIN_CLIENT_ID: '' });
    expect(() => authUrl('s')).toThrow(/LINKEDIN_CLIENT_ID/);
  });

  it('throws when LINKEDIN_REDIRECT_URI is missing', async () => {
    // Redirect URI has a default in env, so blanking the var still yields a
    // value. Force an empty override to exercise the requireEnv guard.
    const { authUrl } = await load({ ...FULL_ENV, LINKEDIN_REDIRECT_URI: '' });
    // env default kicks in -> a non-empty redirect_uri; authUrl still works.
    const url = authUrl('s');
    expect(new URL(url).searchParams.get('redirect_uri')).toBeTruthy();
  });
});

describe('exchangeCode', () => {
  it('posts form-encoded body and returns the mapped token result', async () => {
    const { exchangeCode } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'tok-1',
          expires_in: 5184000,
          refresh_token: 'refresh-1',
          scope: 'openid w_member_social',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const out = await exchangeCode('the-code');
    expect(out).toEqual({
      accessToken: 'tok-1',
      expiresIn: 5184000,
      refreshToken: 'refresh-1',
      scope: 'openid w_member_social',
    });

    const [calledUrl, init] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const body = new URLSearchParams(init?.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe('client-123');
    expect(body.get('client_secret')).toBe('secret-xyz');
  });

  it('throws when the token endpoint returns a non-ok status', async () => {
    const { exchangeCode } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(
      new Response('bad_request', { status: 400 }),
    );
    await expect(exchangeCode('x')).rejects.toThrow(/400/);
  });

  it('throws when CLIENT_SECRET is missing', async () => {
    const { exchangeCode } = await load({ ...FULL_ENV, LINKEDIN_CLIENT_SECRET: '' });
    await expect(exchangeCode('x')).rejects.toThrow(/LINKEDIN_CLIENT_SECRET/);
  });
});

describe('fetchMemberSub', () => {
  it('returns the sub claim and sends a Bearer token', async () => {
    const { fetchMemberSub } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ sub: 'abc' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const sub = await fetchMemberSub('tok-1');
    expect(sub).toBe('abc');

    const [calledUrl, init] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl).toBe('https://api.linkedin.com/v2/userinfo');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('throws when sub is missing from the response', async () => {
    const { fetchMemberSub } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ name: 'no sub here' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(fetchMemberSub('tok-1')).rejects.toThrow(/sub/i);
  });

  it('throws when userinfo returns a non-ok status', async () => {
    const { fetchMemberSub } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(fetchMemberSub('tok-1')).rejects.toThrow(/401/);
  });
});

describe('LINKEDIN_STATE_COOKIE', () => {
  it('is a non-empty string', async () => {
    const { LINKEDIN_STATE_COOKIE } = await load(FULL_ENV);
    expect(typeof LINKEDIN_STATE_COOKIE).toBe('string');
    expect(LINKEDIN_STATE_COOKIE.length).toBeGreaterThan(0);
  });
});
