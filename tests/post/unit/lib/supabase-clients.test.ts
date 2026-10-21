import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Supabase client wrappers read lib/env, whose `env` const is built from
// process.env AT IMPORT. So to vary env per test we reset the module registry,
// stub process.env, then dynamically import (the razorpay.test.ts pattern).
//
// We mock the underlying Supabase SDK factories so no real client is built and
// we can assert exactly what URL/key our wrapper passed through.

const mBrowser = vi.fn(() => ({ __kind: 'browser' }));
const mServer = vi.fn(() => ({ __kind: 'server' }));
const mAdmin = vi.fn(() => ({ __kind: 'admin' }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: (...args: unknown[]) => mBrowser(...(args as [])),
  createServerClient: (...args: unknown[]) => mServer(...(args as [])),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mAdmin(...(args as [])),
}));

// next/headers cookies() is invoked by server.createClient(); give it a stub so
// construction doesn't blow up outside a request scope.
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(() => ({ value: 'x' })),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: () => [],
  }),
  headers: () => new Headers(),
}));

async function loadClient(envOverrides: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/supabase/client');
}
async function loadAdmin(envOverrides: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/supabase/admin');
}
async function loadServer(envOverrides: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/supabase/server');
}

beforeEach(() => {
  mBrowser.mockClear();
  mServer.mockClear();
  mAdmin.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('supabase/client createClient', () => {
  it('uses the placeholder url/key fallbacks when env is absent', async () => {
    const { createClient } = await loadClient({
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    createClient();
    expect(mBrowser).toHaveBeenCalledWith(
      'https://placeholder.supabase.co',
      'public-anon-key-placeholder',
    );
  });

  it('passes through the real url/key when env is present', async () => {
    const { createClient } = await loadClient({
      NEXT_PUBLIC_SUPABASE_URL: 'https://real.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'real-anon-key',
    });
    createClient();
    expect(mBrowser).toHaveBeenCalledWith('https://real.supabase.co', 'real-anon-key');
  });
});

describe('supabase/admin createAdminClient', () => {
  it('throws when SUPABASE_SERVICE_ROLE_KEY is absent', async () => {
    const { createAdminClient } = await loadAdmin({
      NEXT_PUBLIC_SUPABASE_URL: 'https://real.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: '',
    });
    expect(() => createAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('throws when NEXT_PUBLIC_SUPABASE_URL is absent', async () => {
    const { createAdminClient } = await loadAdmin({
      NEXT_PUBLIC_SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    });
    expect(() => createAdminClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('constructs the service-role client with the configured url + service key', async () => {
    const { createAdminClient } = await loadAdmin({
      NEXT_PUBLIC_SUPABASE_URL: 'https://real.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    });
    createAdminClient();
    expect(mAdmin).toHaveBeenCalledWith(
      'https://real.supabase.co',
      'service-key',
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  });
});

describe('supabase/server getUser', () => {
  it('returns null when supabase env is absent (no network call)', async () => {
    const { getUser } = await loadServer({
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    expect(await getUser()).toBeNull();
    // Short-circuits before building a server client.
    expect(mServer).not.toHaveBeenCalled();
  });

  it('returns the user from auth.getUser when env is present', async () => {
    const user = { id: 'user-1', email: 'user@example.com' };
    mServer.mockReturnValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    } as never);

    const { getUser } = await loadServer({
      NEXT_PUBLIC_SUPABASE_URL: 'https://real.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'real-anon-key',
    });

    expect(await getUser()).toEqual(user);
    expect(mServer).toHaveBeenCalled();
  });

  it('returns null (does not throw) when the client construction/auth throws', async () => {
    mServer.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const { getUser } = await loadServer({
      NEXT_PUBLIC_SUPABASE_URL: 'https://real.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'real-anon-key',
    });

    expect(await getUser()).toBeNull();
  });
});
