import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// GATED RLS integration test. Skips unless a live Supabase project is configured.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasLiveCreds = Boolean(SERVICE_ROLE_KEY && SUPABASE_URL);

describe('RLS integration gating', () => {
  it('only runs the live-DB suite when service-role + project URL are configured', () => {
    expect(typeof hasLiveCreds).toBe('boolean');
    expect(hasLiveCreds).toBe(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL));
  });
});

describe.skipIf(!hasLiveCreds)('RLS: anon cannot read another creator’s pieces', () => {
  let anon: SupabaseClient | null = null;
  const anonAvailable = Boolean(ANON_KEY);
  beforeAll(() => {
    anon = ANON_KEY ? createClient(SUPABASE_URL!, ANON_KEY, { auth: { persistSession: false } }) : null;
  });

  it.skipIf(!anonAvailable)('anon SELECT on bhasha_pieces returns zero rows', async () => {
    const { data, error } = await anon!.from('bhasha_pieces').select('id').limit(1);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
