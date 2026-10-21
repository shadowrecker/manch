'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db/types';
import { env } from '@/lib/env';

// Build-time/dev fallbacks so static prerender and `npm run dev` don't crash
// when env is absent. NEXT_PUBLIC_* values are inlined at build time, so a
// production bundle built WITH the env set carries the real values; auth simply
// won't work against the placeholder, which is the correct behaviour pre-setup.
const URL_FALLBACK = 'https://placeholder.supabase.co';
const KEY_FALLBACK = 'public-anon-key-placeholder';

/** Browser Supabase client (anon key + RLS). Use inside client components. */
export function createClient() {
  return createBrowserClient<Database>(
    env.supabaseUrl || URL_FALLBACK,
    env.supabaseAnonKey || KEY_FALLBACK,
  );
}
