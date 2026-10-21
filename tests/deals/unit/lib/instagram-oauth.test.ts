import { describe, it, expect, vi, afterEach } from 'vitest';

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('@/lib/modules/deals/instagram/oauth');
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Instagram OAuth', () => {
  it('authUrl carries client_id, redirect, scope, and state', async () => {
    const { authUrl } = await load({ META_APP_ID: 'app1', INSTAGRAM_REDIRECT_URI: 'https://x/cb' });
    const url = new URL(await authUrl('st8'));
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('app1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toMatch(/instagram_business_basic/);
    expect(url.searchParams.get('state')).toBe('st8');
  });

  it('authUrl throws without META_APP_ID', async () => {
    const { authUrl } = await load({ META_APP_ID: '' });
    expect(() => authUrl('x')).toThrow(/META_APP_ID/);
  });

  it('exchangeCode returns the short token + ig user id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'tok', user_id: 12345 }), { status: 200 })));
    const { exchangeCode } = await load({ META_APP_ID: 'a', META_APP_SECRET: 's' });
    expect(await exchangeCode('code')).toEqual({ accessToken: 'tok', igUserId: '12345' });
  });

  it('getLongLivedToken returns the long token + expiry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'long', expires_in: 5184000 }), { status: 200 })));
    const { getLongLivedToken } = await load({ META_APP_SECRET: 's' });
    expect(await getLongLivedToken('short')).toEqual({ accessToken: 'long', expiresIn: 5184000 });
  });
});
