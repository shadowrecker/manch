import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { env } from '@/lib/env';

/**
 * Request-scoped Supabase client for Server Components, Route Handlers and
 * Server Actions. Reads the auth session from cookies and enforces RLS.
 *
 * Return type is pinned to SupabaseClient<Database> so typed .from()/.select()
 * queries resolve correctly across @supabase/ssr + supabase-js version skew.
 */
export function createClient(): SupabaseClient<Database> {
  const cookieStore = cookies();
  // Fallbacks keep construction from throwing when env is absent (dev / pre-setup).
  // getUser() short-circuits before any network call in that case, so routes
  // degrade to "logged out" rather than 500. Production always sets real env.
  return createServerClient<Database>(
    env.supabaseUrl || 'https://placeholder.supabase.co',
    env.supabaseAnonKey || 'public-anon-key-placeholder',
    {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Safe to ignore — middleware refreshes the session.
        }
      },
    },
    },
  );
}

/** Convenience: the currently authenticated user, or null. */
export async function getUser() {
  // No backend configured → treat as unauthenticated (don't crash the route).
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
