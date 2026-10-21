import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({})),
  createServerClient: vi.fn(() => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: vi.fn() }) }));

import { createBrowserClient } from '@supabase/ssr';
import { createClient as createJsClient } from '@supabase/supabase-js';

async function load(path: string, env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import(path);
}
afterEach(() => vi.unstubAllEnvs());

describe('supabase browser client', () => {
  it('uses placeholder fallbacks when env is absent', async () => {
    const { createClient } = await load('@/lib/supabase/client', { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' });
    createClient();
    expect(createBrowserClient).toHaveBeenCalledWith('https://placeholder.supabase.co', 'public-anon-key-placeholder');
  });
  it('uses real values when configured', async () => {
    const { createClient } = await load('@/lib/supabase/client', { NEXT_PUBLIC_SUPABASE_URL: 'https://real.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' });
    createClient();
    expect(createBrowserClient).toHaveBeenLastCalledWith('https://real.co', 'anon');
  });
});

describe('supabase admin client', () => {
  it('throws without the service-role key', async () => {
    const { createAdminClient } = await load('@/lib/supabase/admin', { SUPABASE_SERVICE_ROLE_KEY: '', NEXT_PUBLIC_SUPABASE_URL: 'https://x.co' });
    expect(() => createAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
  it('constructs with persistSession:false when configured', async () => {
    const { createAdminClient } = await load('@/lib/supabase/admin', { SUPABASE_SERVICE_ROLE_KEY: 'svc', NEXT_PUBLIC_SUPABASE_URL: 'https://x.co' });
    createAdminClient();
    expect(createJsClient).toHaveBeenCalledWith('https://x.co', 'svc', expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }));
  });
});

describe('getUser', () => {
  it('returns null (no client) when Supabase env is absent', async () => {
    const { getUser } = await load('@/lib/supabase/server', { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' });
    expect(await getUser()).toBeNull();
  });
  it('returns the user when configured', async () => {
    const { getUser } = await load('@/lib/supabase/server', { NEXT_PUBLIC_SUPABASE_URL: 'https://x.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a' });
    expect(await getUser()).toMatchObject({ id: 'u1' });
  });
});
